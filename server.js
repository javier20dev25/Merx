const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const fetch = require('node-fetch');

// --- Helpers de Utilidad ---
async function fetchWithTimeout(url, options = {}, timeout = 18000) { // Aumentado para prompts complejos
  const controller = new AbortController();
  options.signal = controller.signal;
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, options);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout / 1000} seconds`);
    }
    throw error;
  }
}

function cleanModelJsonString(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  let s = raw.replace(/^\uFEFF/, '').trim();
  s = s.replace(/^```(?:json)?\n?/, '');
  s = s.replace(/\n?```$/, '');
  return s.trim();
}

function tryParseModelJson(raw) {
  const cleaned = cleanModelJsonString(raw);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Fallo al parsear JSON, intentando limpiar:", cleaned);
    throw new Error('No se pudo parsear JSON del modelo: ' + e.message);
  }
}

async function getApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) return apiKey;
  const keyPath = path.join(__dirname, 'credencialgemini');
  if (fsSync.existsSync(keyPath)) {
    const txt = await fs.readFile(keyPath, 'utf-8');
    const m = txt.match(/AIza[A-Za-z0-9_-]{35}/);
    if (m) return m[0];
  }
  throw new Error('API Key de Gemini no encontrada.');
}

// --- NUEVA ARQUITECTURA DE LLAMADAS A LA IA ---

async function loadContext(filePath) {
    try {
        return await fs.readFile(path.join(__dirname, 'conocimientos', filePath), 'utf-8');
    } catch (error) {
        console.warn(`Advertencia: No se pudo cargar el contexto: ${filePath}`);
        return '';
    }
}

async function callGemini(prompt, apiKey) {
    const modelName = 'gemini-2.5-flash-lite'; // MODELO CORREGIDO Y FIJADO
    const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`; // API v1 CORREGIDA
    
    const response = await fetchWithTimeout(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
                // response_mime_type: "application/json", // Eliminado para compatibilidad con v1
            }
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Error en la API de Gemini ${response.status}: ${errorBody}`);
    }

    const rawData = await response.json();
    const candidateText = rawData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
        console.error("Respuesta de Gemini sin contenido:", JSON.stringify(rawData));
        throw new Error('La API de Gemini no devolvió contenido válido.');
    }
    return tryParseModelJson(candidateText);
}

// 1. Clasificación
async function callClassification(apiKey, description, notes) {
    const promptTemplate = await fs.readFile(path.join(__dirname, 'prompts', 'prompt_clasificacion.txt'), 'utf-8');
    const rgiContext = await loadContext('razonamiento_rgi_avanzado.txt');
    const prompt = promptTemplate.replace('{RGI_CONTEXT}', rgiContext).replace('{DESCRIPTION}', description).replace('{NOTES}', notes);
    return callGemini(prompt, apiKey);
}

// 2. Base Legal
async function callLegalBasis(apiKey, codigo) {
    const promptTemplate = await fs.readFile(path.join(__dirname, 'prompts', 'prompt_base_legal.txt'), 'utf-8');
    const legalContext = `${await loadContext('jurisprudencia_tata_dga.txt')}\n\n${await loadContext('contexto_legal_sac.txt')}`;
    const notesTypeContext = await loadContext('tipos-de-notas.json');
    const prompt = promptTemplate
        .replace('{LEGAL_CONTEXT}', legalContext)
        .replace('{NOTES_TYPE_CONTEXT}', notesTypeContext)
        .replace('{CODIGO}', codigo);
    return callGemini(prompt, apiKey);
}

// 3. Regulaciones
async function callRegulatoryAnalysis(apiKey, description) {
    const promptTemplate = await fs.readFile(path.join(__dirname, 'prompts', 'prompt_regulaciones.txt'), 'utf-8');
    const regulatoryContext = await loadContext('analisis_riesgo_tecnico_comercial.txt');
    const prompt = promptTemplate.replace('{REGULATORY_CONTEXT}', regulatoryContext).replace('{DESCRIPTION}', description);
    return callGemini(prompt, apiKey);
}

// 4. Riesgo de Mercancía
async function callCustomsRiskAnalysis(apiKey, description) {
    const promptTemplate = await fs.readFile(path.join(__dirname, 'prompts', 'prompt_riesgo_mercancia.txt'), 'utf-8');
    const riskContext = await loadContext('gestion_riesgos_aduaneros_ni.txt');
    const prompt = promptTemplate.replace('{RISK_CONTEXT}', riskContext).replace('{DESCRIPTION}', description);
    return callGemini(prompt, apiKey);
}

// 5. Optimización Arancelaria
async function callTariffOptimization(apiKey, codigo, origen, perfilImportador) {
    const promptTemplate = await fs.readFile(path.join(__dirname, 'prompts', 'prompt_optimizacion_arancelaria.txt'), 'utf-8');
    const tariffContext = await loadContext('regimenes_preferenciales_ni.txt');
    const prompt = promptTemplate.replace('{TARIFF_CONTEXT}', tariffContext).replace('{CODIGO}', codigo).replace('{ORIGEN}', origen).replace('{PERFIL_IMPORTADOR}', perfilImportador);
    return callGemini(prompt, apiKey);
}

// --- Orquestador y Formateador ---
async function generateReportFlow(description, notes, origen, perfilImportador) {
    const apiKey = await getApiKey();
    const fullReport = {};

    console.log("Iniciando Paso 1: Clasificación...");
    fullReport.classification = await callClassification(apiKey, description, notes);
    const codigo = fullReport.classification?.clasificacionPropuesta?.codigo;
    if (!codigo) throw new Error('Paso 1 fallido: No se pudo obtener el código arancelario inicial.');

    console.log(`Paso 1 completado. Código: ${codigo}. Iniciando Pasos 2-5 en paralelo...`);
    const [legal, regulatory, risk, tariff] = await Promise.all([
        callLegalBasis(apiKey, codigo).catch(e => ({error: e.message})),
        callRegulatoryAnalysis(apiKey, description).catch(e => ({error: e.message})),
        callCustomsRiskAnalysis(apiKey, description).catch(e => ({error: e.message})),
        callTariffOptimization(apiKey, codigo, origen, perfilImportador).catch(e => ({error: e.message}))
    ]);
    console.log("Pasos 2-5 completados.");

    fullReport.legal = legal;
    fullReport.regulatory = regulatory;
    fullReport.risk = risk;
    fullReport.tariff = tariff;

    return fullReport;
}

function reportToUI(report) {
    const parts = [];
    const addSection = (title, content) => parts.push(`\n### ${title}\n${content}`);

    if (report.classification?.clasificacionPropuesta) {
        const { codigo, descripcion } = report.classification.clasificacionPropuesta;
        const { scoreFiabilidad, argumentoMerciologico } = report.classification;
        addSection('1. Análisis de Clasificación Arancelaria', 
            `**Código Propuesto:** ${codigo || 'N/A'}\n` +
            `**Descripción:** ${descripcion || 'N/A'}\n` +
            `**Fiabilidad:** ${scoreFiabilidad ? Math.round(scoreFiabilidad * 100) + '%' : 'N/A'}\n` +
            `**Argumento Merciológico:**\n${argumentoMerciologico || 'N/A'}`
        );
    }

    if (report.legal && !report.legal.error) {
        const { applied_rules, notes_applied, jurisprudencia } = report.legal.fundamentoLegal;
        let content = '';
        if (applied_rules?.length > 0) content += '**Reglas Generales Aplicadas:**\n' + applied_rules.map(r => `- **${r.rule_id}:** ${r.descripcion}`).join('\n') + '\n';
        if (notes_applied?.length > 0) content += '**Notas de Sección/Capítulo:**\n' + notes_applied.map(n => `- **${n.note_id} (${n.tipo || 'N/A'}):** ${n.descripcion}`).join('\n') + '\n';
        if (jurisprudencia?.length > 0) content += '**Jurisprudencia Relevante (TATA):**\n' + jurisprudencia.map(j => `- **${j.case_id}:** ${j.summary}`).join('\n') + '\n';
        if(content) addSection('2. Fundamento Legal y Jurisprudencia', content);
    }

    if (report.regulatory && !report.regulatory.error) {
        const { institucionPrincipal, requisitos } = report.regulatory.analisisRegulatorio;
        if (requisitos?.length > 0) {
            let content = `**Institución Principal Sugerida:** ${institucionPrincipal || 'N/A'}\n**Requisitos y Permisos:**\n` + requisitos.map(r => `- **${r.nombre} (${r.institucion}):** ${r.detalle}`).join('\n');
            addSection('3. Análisis Regulatorio (Permisos y Barreras)', content);
        }
    }

    if (report.risk && !report.risk.error) {
        const { analisisRiesgoMercancia } = report.risk;
        if (analisisRiesgoMercancia?.length > 0) {
            let content = analisisRiesgoMercancia.map(r => `**${r.riesgoIdentificado}:** ${r.justificacion}\n  *Recomendación:* ${r.recomendacion}`).join('\n\n');
            addSection('4. Análisis de Riesgo Inherente a la Mercancía', content);
        }
    }

    if (report.tariff && !report.tariff.error) {
        const { regimenSugerido, cumpleOrigenPotencial, justificacionOrigen, comparativaArancelaria, recomendacionEstrategica } = report.tariff.analisisOptimizacion;
        if (regimenSugerido) {
            let content = `**Régimen Sugerido:** ${regimenSugerido}\n` +
                          `**Cumple Origen Potencial:** ${cumpleOrigenPotencial}\n` +
                          `*Justificación:* ${justificacionOrigen}\n\n` +
                          `**Comparativa:**\n- Arancel Normal (NMF): ${comparativaArancelaria.arancelNMF}\n- Arancel Preferencial: ${comparativaArancelaria.arancelPreferencial}\n`+
                          `**Ahorro Potencial:** ${comparativaArancelaria.ahorroPotencial}\n\n`+
                          `**Recomendación Estratégica:** ${recomendacionEstrategica}`;
            addSection('5. Análisis de Optimización Arancelaria', content);
        }
    }

    // Sección final de resumen
    if (parts.length > 0) {
        const summary = `El análisis sugiere la clasificación en el código ${report.classification?.clasificacionPropuesta?.codigo || '[no determinado]'}. Se identificaron ${report.regulatory?.analisisRegulatorio?.requisitos?.length || 0} requisitos regulatorios y ${report.risk?.analisisRiesgoMercancia?.length || 0} riesgos inherentes. Se recomienda ${report.tariff?.analisisOptimizacion?.recomendacionEstrategica || 'revisar la documentación para asegurar el cumplimiento'}.`;
        addSection('### Dictamen Técnico Preliminar (No Vinculante)', summary);
    }

    return { ui_text: parts.join('\n') };
}

// --- Servidor Express y Endpoints ---
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

app.post('/api/find-sac-chapter', async (req, res) => {
    try {
        const { description } = req.body;
        if (!description) return res.status(400).json({ error: 'La descripción no puede estar vacía.' });

        const apiKey = await getApiKey();
        const indiceText = await loadContext('secciones-capitulos.json');
        const promptTemplate = `Eres un asistente experto en clasificación arancelaria. Tu única fuente de verdad es el siguiente índice del Sistema Arancelario. Determina el número de capítulo más probable para la mercancía descrita.\n\nINDICE:\n${indiceText}\n\nDESCRIPCIÓN: "${description}"\n\nSALIDA JSON: { "chapter_number": <número>, "rationale": "<justificación breve>" }`;
        
        const aiResult = await callGemini(promptTemplate, apiKey);
        const chapterNumber = aiResult.chapter_number;
        if (!chapterNumber) return res.status(404).json({ error: 'El modelo no pudo determinar un capítulo.' });

        const sectionsData = JSON.parse(indiceText);
        let foundSection = null, foundChapter = null;
        for (const section of sectionsData) {
            const chapter = section.chapters.find(c => c.number == chapterNumber);
            if (chapter) {
                foundSection = section; foundChapter = chapter; break;
            }
        }

        if (!foundChapter) return res.status(404).json({ error: `Capítulo ${chapterNumber} no encontrado.` });

        res.status(200).json({
            section: foundSection.name.split(':')[0],
            chapter: foundChapter.name,
            chapter_number: foundChapter.number,
            rationale: aiResult.rationale
        });

    } catch (error) {
        console.error('Error en /api/find-sac-chapter:', error.stack || error);
        res.status(500).json({ error: 'Error interno en el servidor.', message: error.message });
    }
});

app.post('/api/generate-report', async (req, res) => {
    try {
        const { description, notes, origen, perfilImportador } = req.body;
        if (!description) return res.status(400).json({ error: 'La descripción es obligatoria.' });

        const finalReport = await generateReportFlow(description, notes, origen || 'No especificado', perfilImportador || 'General');
        const userView = reportToUI(finalReport);

        res.status(200).json({ 
            ok: true, 
            ui_text: userView.ui_text, 
            report: finalReport
        });
    } catch (error) {
        console.error('Error fatal en /api/generate-report:', error.stack || error);
        res.status(500).json({ ok: false, error: 'Error interno al generar el informe.', message: error.message });
    }
});

module.exports = app;

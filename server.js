const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const fetch = require('node-fetch');

// --- Helper para Timeouts ---
async function fetchWithTimeout(url, options = {}, timeout = 9000) { // Reducido para Vercel
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

// Helpers para limpiar y parsear JSON devuelto por el modelo
function cleanModelJsonString(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  let s = raw.replace(/^\uFEFF/, '').trim();
  s = s.replace(/^```(?:[a-zA-Z0-9_-]+\s*)?\n?/, '');
  s = s.replace(/\n?```$/, '');
  return s.trim();
}

function tryParseModelJson(raw) {
  const cleaned = cleanModelJsonString(raw);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      const candidate = cleaned.slice(first, last + 1);
      try { return JSON.parse(candidate); } catch (e2) { /* seguirá abajo */ }
    }
    throw new Error('No se pudo parsear JSON del modelo');
  }
}

// --- Helpers de Modelo y API Key (Adaptado para Vercel) ---
async function getApiKey() {
  // **MODIFICADO PARA VERCEL:** Lee la API key desde las variables de entorno.
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    console.log('GEMINI_API_KEY present in environment.');
    return apiKey;
  }
  // Fallback para entorno local (si `credencialgemini` existe)
  console.log('GEMINI_API_KEY not in env, trying local file fallback.');
  const keyPath = path.join(__dirname, 'credencialgemini');
  if (fsSync.existsSync(keyPath)) {
    const txt = await fs.readFile(keyPath, 'utf-8');
    const m = txt.match(/AIza[A-Za-z0-9_-]{35}/);
    if (m) return m[0];
  }
  throw new Error('API Key not found in environment variables or local credencialgemini file.');
}

async function listModels(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
  const r = await fetchWithTimeout(url, {}, 8000);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`ListModels failed: ${r.status} ${body}`);
  }
  const data = await r.json();
  return data.models || [];
}

async function chooseModel(apiKey) {
  // **MODIFICADO:** Se fuerza el uso del modelo "gemini-2.5-flash-lite" según el requisito.
  const modelName = "gemini-2.5-flash-lite";
  console.log(`[INFO] Using mandatory model as required: ${modelName}`);
  return modelName;
}

// --- Flujo de Generación de Reporte ---
// (Las funciones callClassification, callLegalBasis, y generateReportFlow permanecen igual)
async function callClassification(apiKey, modelName, description, notes) {
  const prompt = `
Eres un sistema experto en clasificación arancelaria. Tu única fuente de verdad es la descripción de la mercancía. No uses conocimiento externo.
INSTRUCCIÓN: Para la descripción de mercancía, determina la clasificación más probable.
Reglas:
1. Devuelve ÚNICAMENTE un JSON válido.
2. El campo "codigo" debe ser un código arancelario plausible.
3. El "argumentoMerciologico" debe ser una justificación técnica concisa.

Descripción: "${description}"
Notas Adicionales: "${notes}"

Salida: Sólo devuelve JSON siguiendo exactamente este esquema:
{
  "clasificacionPropuesta": { 
    "codigo": "<código arancelario>", 
    "descripcion": "<descripción de la partida>" 
  },
  "scoreFiabilidad": 0.0,
  "argumentoMerciologico": "<justificación técnica>"
}
`;
  const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
  const resp = await fetchWithTimeout(geminiUrl, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ 
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
              "temperature": 0.2,
              "maxOutputTokens": 1024
          }
      })
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Classification API error ${resp.status}: ${body}`);
  }
  const rawData = await resp.json();
  const candidateText = rawData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidateText) {
    console.error('Respuesta inesperada del modelo en callClassification:', JSON.stringify(rawData).slice(0, 1000));
    throw new Error('Modelo devolvió estructura inesperada');
  }
  try {
    return tryParseModelJson(candidateText);
  } catch (err) {
    console.error('Error parseando JSON del modelo en callClassification:', err.message);
    return { raw_text: candidateText }; // Fallback
  }
}

async function callLegalBasis(apiKey, modelName, arancelCode) {
    let contextText = '';
    try {
        const legalPath = path.join(__dirname, 'conocimientos', 'contexto_legal_sac.txt');
        if (fsSync.existsSync(legalPath)) {
            contextText = (await fs.readFile(legalPath, 'utf8')).slice(0, 16000);
        }
    } catch (e) {
        console.warn('No se pudo cargar contexto legal desde disco.');
    }
  const prompt = `
Eres un experto en legislación aduanera. TU ÚNICA FUENTE de verdad es el contexto legal provisto. No uses conocimiento externo.
CONTEXTO:
${contextText}

INSTRUCCIÓN: Para el código arancelario "${arancelCode}", extrae únicamente del CONTEXTO las Reglas Generales Interpretativas y las Notas de Capítulo/Sección que justifican su clasificación.
Reglas:
1. Devuelve ÚNICAMENTE un JSON válido.
2. No inventes reglas o notas que no estén en el CONTEXTO.
3. Si no encuentras fundamento, devuelve arrays vacíos.

Salida: Sólo devuelve JSON siguiendo exactamente este esquema:
{
  "fundamentoLegal": {
    "applied_rules": [ { "rule_id": "<ID de la regla>", "descripcion": "<texto de la regla>" } ],
    "notes_applied": [ { "note_id": "<ID de la nota>", "descripcion": "<texto de la nota>" } ]
  }
}
`;
  const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
  const resp = await fetchWithTimeout(geminiUrl, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ 
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
              "temperature": 0.0,
              "maxOutputTokens": 2048
          }
      })
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`LegalBasis API error ${resp.status}: ${body}`);
  }
  const rawData = await resp.json();
  const candidateText = rawData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidateText) {
    console.error('Respuesta inesperada del modelo en callLegalBasis:', JSON.stringify(rawData).slice(0, 1000));
    throw new Error('Modelo devolvió estructura inesperada');
  }
  try {
    return tryParseModelJson(candidateText);
  } catch (err) {
    console.error('Error parseando JSON del modelo en callLegalBasis:', err.message);
    return { raw_text: candidateText }; // Fallback
  }
}

async function generateReportFlow(description, location, notes) {
  console.log('[DEBUG] Entering generateReportFlow.');
  const apiKey = await getApiKey();
  console.log(`[DEBUG] API Key retrieved.`);
  const modelName = await chooseModel(apiKey);
  console.log(`[DEBUG] Model chosen: ${modelName}`);
  
  console.log('[DEBUG] Calling classification model...');
  const classResp = await callClassification(apiKey, modelName, description, notes);
  console.log('[DEBUG] Classification response received.');

  if (!classResp || !classResp.clasificacionPropuesta || !classResp.clasificacionPropuesta.codigo) {
    console.error('[DEBUG] Invalid structure from classification call:', JSON.stringify(classResp));
    throw new Error('La llamada de clasificación inicial no devolvió una estructura válida.');
  }
  const codigo = classResp.clasificacionPropuesta.codigo;
  console.log(`[DEBUG] Classification successful. Code: ${codigo}`);
  
  let legalResp = {};
  try {
      console.log('[DEBUG] Calling legal basis model...');
      legalResp = await callLegalBasis(apiKey, modelName, codigo);
      console.log('[DEBUG] Legal basis response received.');
  } catch (e) {
      console.error(`[DEBUG] Failed to get legal basis, will return partial report. Error: ${e.message}`);
  }
  
  const finalReport = { 
      ...classResp, 
      fundamentoLegal: (legalResp && legalResp.fundamentoLegal) || { applied_rules: [], notes_applied: [] }, 
      conclusion: 'Informe generado en dos pasos con prompts mejorados.' 
  };
  console.log('[DEBUG] Final report constructed. Sending response.');
  return finalReport;
}

// ----------------- Helpers UI -----------------
function reportToUI(report) {
    const { clasificacionPropuesta, fundamentoLegal, scoreFiabilidad, argumentoMerciologico } = report;

    if (!clasificacionPropuesta || !clasificacionPropuesta.codigo) {
        return { ui_text: "No se pudo generar un informe completo." };
    }

    const parts = [];
    parts.push(`**Clasificación Propuesta:** ${clasificacionPropuesta.codigo}`);
    parts.push(`**Descripción:** ${clasificacionPropuesta.descripcion}`);
    if(scoreFiabilidad) {
        parts.push(`**Fiabilidad:** ${Math.round(scoreFiabilidad * 100)}%`);
    }
    parts.push(`\n**Justificación Merciológica:**\n${argumentoMerciologico}`);

    if (fundamentoLegal) {
        if (fundamentoLegal.applied_rules && fundamentoLegal.applied_rules.length > 0) {
            parts.push(`\n**Reglas Generales Aplicadas:**`);
            fundamentoLegal.applied_rules.forEach(rule => {
                parts.push(`- ${rule.rule_id}: ${rule.descripcion}`);
            });
        }
        if (fundamentoLegal.notes_applied && fundamentoLegal.notes_applied.length > 0) {
            parts.push(`\n**Notas de Sección/Capítulo Aplicadas:**`);
            fundamentoLegal.notes_applied.forEach(note => {
                parts.push(`- ${note.note_id}: ${note.descripcion}`);
            });
        }
    }
    
    return { ui_text: parts.join('\n') };
}


// --- Servidor Express ---
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

app.get('/api/debug-env', (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    res.status(200).json({
      message: 'GEMINI_API_KEY is present.',
      keyExists: true,
      keyLength: apiKey.length,
      firstChars: apiKey.substring(0, 4)
    });
  } else {
    res.status(404).json({
      message: 'GEMINI_API_KEY is NOT found in process.env.',
      keyExists: false
    });
  }
});

app.post('/api/find-sac-chapter', async (req, res) => {
    try {
        const { description } = req.body;
        if (!description) return res.status(400).json({ error: 'La descripción no puede estar vacía.' });

        const apiKey = await getApiKey();
        const modelName = await chooseModel(apiKey);
        
        const sacContextPath = path.join(__dirname, 'conocimientos', 'secciones-capitulos.json');
        if (!fsSync.existsSync(sacContextPath)) {
            return res.status(500).json({ error: 'Archivo de contexto "secciones-capitulos.json" no encontrado.' });
        }
        const indiceText = await fs.readFile(sacContextPath, 'utf-8');

        const prompt = `
Eres un asistente experto en clasificación arancelaria (merciología). TU ÚNICA FUENTE de verdad para ubicar mercancías en el SAC será el índice que te entregue el usuario en este mismo request. No uses conocimiento externo. Basate estrictamente en el texto del índice.

INDICE:
${indiceText}

INSTRUCCIÓN: Dada la siguiente descripción de mercancía, determina el número de capítulo del SAC.
Reglas:
1. Devuelve ÚNICAMENTE un JSON válido.
2. No inventes números o nombres que no estén en el INDICE.
3. El campo 'chapter_number' debe ser un número entero.

Descripción: "${description}"

Salida: Sólo devuelve JSON siguiendo exactamente este esquema (no texto adicional):
{
  "chapter_number": <Número entero del capítulo>,
  "rationale": "<Breve justificación técnica de por qué pertenece a ese capítulo>"
}
`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
        
        const geminiResponse = await fetchWithTimeout(geminiUrl, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    "temperature": 0.1,
                    "maxOutputTokens": 256
                }
            })
        });

        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.text();
            throw new Error(`API Error: ${geminiResponse.status} ${errorBody}`);
        }

        const rawData = await geminiResponse.json();
        const candidateText = rawData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidateText) {
          throw new Error('Modelo devolvió estructura inesperada');
        }
        
        const aiResult = tryParseModelJson(candidateText);
        const chapterNumber = aiResult.chapter_number;
        const rationale = aiResult.rationale;

        if (!chapterNumber) {
            return res.status(404).json({ error: 'El modelo no pudo determinar un capítulo.', rationale });
        }

        // Lógica para buscar el nombre de la sección y capítulo usando el número
        const sectionsData = JSON.parse(indiceText);
        let foundSection = null;
        let foundChapter = null;

        for (const section of sectionsData) {
            const chapter = section.chapters.find(c => c.number == chapterNumber);
            if (chapter) {
                foundSection = section;
                foundChapter = chapter;
                break;
            }
        }

        if (!foundSection || !foundChapter) {
            return res.status(404).json({ error: `Capítulo ${chapterNumber} no encontrado en el índice.` });
        }

        const cleanSectionName = foundSection.name.split(':')[0]; // Extrae "SECCIÓN II" del nombre completo

        // Devolver el objeto JSON estructurado y limpio
        return res.status(200).json({
            section: cleanSectionName,
            chapter: foundChapter.name,
            chapter_number: foundChapter.number, // Añadir número de capítulo
            rationale: rationale
        });

    } catch (error) {
        console.error('Handler exception in /api/find-sac-chapter:', error.stack || error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
        }
    }
});

app.post('/api/generate-report', async (req, res) => {
  try {
    const { description, location, notes } = req.body || {};
    if (!description) return res.status(400).json({ ok: false, error: 'Falta campo description' });
    
    const finalReport = await generateReportFlow(description, location, notes);
    const userView = classificationToUI(finalReport);

    if (process.env.NODE_ENV === 'production') {
      // En producción, devolvemos un objeto simple con el texto para la UI y el reporte completo
      return res.status(200).json({ 
        ok: true, 
        ui_text: userView.ui_text, 
        report: finalReport 
      });
    } else {
      // En desarrollo, incluimos todo para depuración
      return res.status(200).json({ 
        ok: true, 
        ui_text: userView.ui_text, 
        ui: userView.ui_struct,
        report: finalReport, 
        debug_raw: finalReport 
      });
    }

  } catch (err) {
    console.error('Error en /api/generate-report:', err.stack || err);
    return res.status(500).json({ ok: false, error: 'Error interno generando el informe.', message: err.message });
  }
});

app.post('/api/generate-report', async (req, res) => {
  try {
    const { description, location, notes } = req.body || {};
    if (!description) return res.status(400).json({ ok: false, error: 'Falta campo description' });
    
    const finalReport = await generateReportFlow(description, location, notes);
    const userView = reportToUI(finalReport); // FIX: Use the correct formatter

    return res.status(200).json({ 
      ok: true, 
      ui_text: userView.ui_text, 
      report: finalReport 
    });

  } catch (err) {
    console.error('Error en /api/generate-report:', err.stack || err);
    return res.status(500).json({ ok: false, error: 'Error interno generando el informe.', message: err.message });
  }
});

// Exportar la app para Vercel
module.exports = app;

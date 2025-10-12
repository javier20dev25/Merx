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
function classificationToUI(parsed) {
  // Normaliza varias formas de respuesta esperadas
  const candidate =
    parsed?.candidates?.[0] ||
    parsed?.clasificacionPropuesta ||
    (parsed && typeof parsed === 'object' ? parsed : null);

  if (!candidate) {
    return {
      ui_text: 'No se encontró una clasificación confiable para esta descripción.',
      ui_struct: { section: null, chapter: null, heading: null, confidence: 0, rationale: null }
    };
  }

  // intentar leer campos comunes (adapta si tus keys son distintas)
  const section = candidate.section || candidate.seccion || candidate.sectionName || null;
  const chapter = candidate.chapter || candidate.capitulo || candidate.chapterName || null;
  const heading = candidate.heading_or_partida || candidate.partida || candidate.codigo || candidate.descripcion || null;
  // confidence puede venir 0-1 o 0-10; normalizamos a 0-1
  let confidence = null;
  if (typeof candidate.confidence === 'number') confidence = candidate.confidence;
  else if (typeof candidate.scoreFiabilidad === 'number') confidence = Math.min(1, candidate.scoreFiabilidad / 10);
  else if (typeof candidate.score === 'number') confidence = candidate.score;

  const confidencePct = (typeof confidence === 'number') ? Math.round(confidence * 100) + '%' : 'n.d.';
  const rationale = candidate.rationale || candidate.argumentoMerciologico || candidate.reason || '';

  // Texto corto y legible para mostrar en la UI
  const ui_text = [
    heading ? `Partida: ${heading}` : 'Partida: —',
    section ? `Sección: ${section}` : 'Sección: —',
    chapter ? `Capítulo: ${chapter}` : 'Capítulo: —',
    `Confianza: ${confidencePct}`,
    rationale ? `Motivo: ${rationale}` : ''
  ].filter(Boolean).join(' — ');

  return {
    ui_text,
    ui_struct: { section, chapter, heading, confidence, confidencePct, rationale }
  };
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
Eres un asistente experto en clasificación arancelaria (merciología). TU ÚNICA FUENTE de verdad para ubicar mercancías en el SAC será el índice que te entregue el usuario en este mismo request. No uses conocimiento externo. Basate estrictamente en el texto del índice. Si no hay coincidencia clara, devuelve alternativas. Devuelve siempre ÚNICAMENTE JSON válido.

INDICE:
${indiceText}

INSTRUCCIÓN: Dada la siguiente descripción de mercancía, determina la mejor Sección y Capítulo del SAC usando sólo el INDICE.
Reglas:
1. No inventes números o nombres que no estén en el INDICE.
2. Prefiere coincidencias textuales.
3. Devuelve hasta 2 candidatos ordenados por confianza (confidence 0-1).
4. Ignora precio, marca o contexto comercial.
5. Si no encuentras nada, devuelve 'candidates' vacío.

Descripción: "${description}"

Salida: Sólo devuelve JSON siguiendo exactamente este esquema (no texto adicional):
{
  "query": "<texto de entrada tal cual>",
  "candidates": [
    {
      "section": "<Sección exacta del INDICE o null>",
      "chapter": "<Capítulo exacto del INDICE o null>",
      "matched_index_lines": ["<línea 1 exacta del INDICE>", "..."],
      "confidence": 0.00,
      "rationale": "<breve justificación técnica (1–3 frases)>"
    }
  ]
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
                    "maxOutputTokens": 512
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
          console.error('Respuesta inesperada del modelo en find-sac-chapter:', JSON.stringify(rawData).slice(0, 1000));
          throw new Error('Modelo devolvió estructura inesperada');
        }
        
        let finalJson;
        try {
          finalJson = tryParseModelJson(candidateText);
        } catch (err) {
          console.error('Error parseando JSON del modelo en find-sac-chapter:', err.message);
          return res.status(500).json({ error: 'El modelo devolvió una respuesta no válida', raw_text: candidateText });
        }

        const userView = classificationToUI(finalJson);

        if (process.env.NODE_ENV === 'production') {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          return res.status(200).send(userView.ui_text);
        } else {
          return res.status(200).json({
            ui_text: userView.ui_text,
            ui: userView.ui_struct,
            debug_raw: finalJson
          });
        }

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

// Exportar la app para Vercel
module.exports = app;

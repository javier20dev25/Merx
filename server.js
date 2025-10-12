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

// --- Helpers de Parseo y Limpieza de JSON ---
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
  } catch (err) {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      const candidate = cleaned.slice(first, last + 1);
      try { return JSON.parse(candidate); } catch (e) {}
    }
    throw err;
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
  // **MODIFICADO:** Se fuerza el uso del modelo "Gemini 2.5 flash" según el requisito obligatorio.
  const modelName = "gemini-2.5-flash";
  console.log(`[INFO] Using mandatory model as required: ${modelName}`);
  return modelName;
}

// --- Flujo de Generación de Reporte ---
// (Las funciones callClassification, callLegalBasis, y generateReportFlow permanecen igual)
async function callClassification(apiKey, modelName, description, notes) {
  const prompt = `Eres un sistema experto en clasificación arancelaria. Analiza la descripción y devuelve ÚNICAMENTE un JSON válido con la estructura: {"clasificacionPropuesta": { "codigo": "...", "descripcion": "..." },"scoreFiabilidad": 0-10,"argumentoMerciologico": "..."}. No incluyas explicaciones ni bloques de código. Descripción: "${description}". Notas: "${notes}"`;
  const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
  const resp = await fetchWithTimeout(geminiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Classification API error ${resp.status}: ${body}`);
  }
  const rawData = await resp.json();
  const rawText = rawData.candidates[0].content.parts[0].text;
  return tryParseModelJson(rawText);
}

async function callLegalBasis(apiKey, modelName, arancelCode) {
    let contextText = '';
    try {
        // **MODIFICADO PARA VERCEL:** Ruta relativa dentro del proyecto.
        const legalPath = path.join(__dirname, 'conocimientos', 'contexto_legal_sac.txt');
        if (fsSync.existsSync(legalPath)) {
            contextText += (await fs.readFile(legalPath, 'utf8')).slice(0, 8000);
        }
    } catch (e) {
        console.warn('No se pudo cargar contexto legal desde disco.');
    }
  const prompt = `Toma este código arancelario: "${arancelCode}" y el contexto legal provisto. Devuelve ÚNICAMENTE un JSON válido con la estructura:
{
  "fundamentoLegal": {
    "applied_rules": [ { "rule_id": "...", "descripcion": "..." } ],
    "notes_applied": [ { "note_id": "...", "descripcion": "..." } ]
  }
}
No agregues texto adicional fuera del JSON. Basa tu respuesta únicamente en el contexto.
Contexto: ${contextText}`;
  const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
  const resp = await fetchWithTimeout(geminiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`LegalBasis API error ${resp.status}: ${body}`);
  }
  const rawData = await resp.json();
  const rawText = rawData.candidates[0].content.parts[0].text;
  return tryParseModelJson(rawText);
}

async function generateReportFlow(description, location, notes) {
  console.log('[DEBUG] Entering generateReportFlow.');
  const apiKey = await getApiKey();
  console.log(`[DEBUG] API Key retrieved. Length: ${apiKey ? apiKey.length : 0}`);
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
  
  const finalReport = { ...classResp, fundamentoLegal: (legalResp && legalResp.fundamentoLegal) || { applied_rules: [], notes_applied: [] }, conclusion: 'Informe generado en dos pasos.' };
  console.log('[DEBUG] Final report constructed. Sending response.');
  return finalReport;
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
        const sacContext = JSON.parse(await fs.readFile(sacContextPath, 'utf-8'));
        const prompt = `Basado en el siguiente índice del SAC: ${JSON.stringify(sacContext, null, 2)}

Analiza: ''${description}''

Tu tarea es identificar la Sección y el Capítulo más probables. Responde únicamente con el formato: 'Ve a buscar a la Sección <número de sección en números romanos> y Capítulo <número de capítulo>'.`;

        // Usar el endpoint de streaming
        const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelName}:streamGenerateContent?key=${apiKey}`;
        
        const geminiResponse = await fetch(geminiUrl, { // No usar fetchWithTimeout aquí
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.text();
            throw new Error(`API Error: ${geminiResponse.status} ${errorBody}`);
        }

        // Configurar cabeceras para streaming
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        // Leer el stream y pasarlo al cliente
        for await (const chunk of geminiResponse.body) {
            // El chunk es un Buffer, lo decodificamos a string
            const rawChunk = chunk.toString('utf8');
            try {
                // La respuesta del stream viene en formato JSON, pero en trozos.
                // Cada trozo es un JSON que contiene un array de candidatos.
                const chunkData = JSON.parse(rawChunk.replace('data: ', ''));
                const textPart = chunkData.candidates[0].content.parts[0].text;
                res.write(textPart); // Escribimos solo el texto en el stream de respuesta
            } catch (e) {
                // Ignorar trozos que no son JSON válido (pueden ser delimitadores o chunks vacíos)
                console.warn('Chunk no procesable, ignorando:', rawChunk);
            }
        }

        res.end(); // Finalizar la respuesta de streaming

    } catch (error) {
        console.error('Handler exception in /api/find-sac-chapter:', error.stack || error);
        // Si el stream ya empezó, no podemos enviar un status 500.
        // El error ya se logueó, y el cliente simplemente dejará de recibir datos.
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
    const reportToSend = { ...finalReport };
    reportToSend.clasificacionPropuesta = reportToSend.clasificacionPropuesta || {};
    reportToSend.clasificacionPropuesta.codigo = reportToSend.clasificacionPropuesta.codigo || 'N/A';
    reportToSend.clasificacionPropuesta.descripcion = reportToSend.clasificacionPropuesta.descripcion || 'N/A';
    reportToSend.scoreFiabilidad = (typeof reportToSend.scoreFiabilidad !== 'undefined') ? reportToSend.scoreFiabilidad : null;
    reportToSend.argumentoMerciologico = reportToSend.argumentoMerciologico || '';
    reportToSend.fundamentoLegal = reportToSend.fundamentoLegal || { applied_rules: [], notes_applied: [] };
    reportToSend.conclusion = reportToSend.conclusion || '';
    return res.status(200).json({ ok: true, report: reportToSend });
  } catch (err) {
    console.error('Error en /api/generate-report:', err.stack || err);
    return res.status(500).json({ ok: false, error: 'Error interno generando el informe.', message: err.message });
  }
});

// Exportar la app para Vercel
module.exports = app;

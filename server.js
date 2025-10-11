const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const fetch = require('node-fetch');

// --- Helper para Timeouts ---
async function fetchWithTimeout(url, options = {}, timeout = 60000) {
  const controller = new AbortController();
  const { signal } = controller;
  options.signal = signal;

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

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

// --- Helpers de Modelo y API Key ---
async function getApiKey() {
  // Usa ruta relativa para portabilidad
  const keyPath = path.join(__dirname, 'credencialgemini');
  if (!fsSync.existsSync(keyPath)) {
    throw new Error('API Key file "credencialgemini" not found.');
  }
  const txt = await fs.readFile(keyPath, 'utf-8');
  const m = txt.match(/AIza[A-Za-z0-9_-]{35}/);
  if (!m) {
    throw new Error('Valid API Key not found in "credencialgemini".');
  }
  return m[0];
}

async function listModels(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
  const r = await fetchWithTimeout(url, {}, 15000); // Timeout más corto para listar
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`ListModels failed: ${r.status} ${body}`);
  }
  const data = await r.json();
  return data.models || [];
}

async function chooseModel(apiKey) {
  const preferred = [
    "gemini-2.5-flash-preview-09-2025",
    "gemini-pro"
  ];
  try {
    const models = await listModels(apiKey);
    const names = models.map(m => (m.name || m.model || "").replace("models/", "")).filter(Boolean);

    for (const p of preferred) {
      if (names.includes(p)) return p;
    }
    
    const anyFlash = names.find(n => /flash/i.test(n));
    if (anyFlash) return anyFlash;

    if (names.length > 0) return names[0];
    
    throw new Error('No models available for this API key.');

  } catch (error) {
    console.error(`Could not dynamically choose model due to error: ${error.message}. Falling back to "gemini-pro".`);
    return 'gemini-pro';
  }
}

const app = express();
const PORT = 5000;

app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'static')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// --- Rutas de la API ---

app.post('/api/find-sac-chapter', async (req, res) => {
    try {
        const { description } = req.body;
        if (!description) {
            return res.status(400).json({ error: 'La descripción no puede estar vacía.' });
        }

        const apiKey = await getApiKey();
        const modelName = await chooseModel(apiKey);
        console.log(`Modelo seleccionado para find-sac-chapter: ${modelName}`);

        // Usa rutas relativas para portabilidad
        const sacContextPath = path.join(__dirname, '..', 'conocimientos', 'secciones-capitulos.json');
        if (!fsSync.existsSync(sacContextPath)) {
          return res.status(500).json({ error: 'Archivo de contexto "secciones-capitulos.json" no encontrado.' });
        }
        const sacContextRaw = await fs.readFile(sacContextPath, 'utf-8');
        const sacContext = JSON.parse(sacContextRaw);

        const prompt = `Basado en el siguiente índice del SAC: ${JSON.stringify(sacContext, null, 2)}

Analiza: ''${description}''

Tu tarea es identificar la Sección y el Capítulo más probables. Responde únicamente con el formato: 'Ve a buscar a la Sección <número de sección en números romanos> y Capítulo <número de capítulo>'.`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
        const geminiResponse = await fetchWithTimeout(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.text();
            throw new Error(`API Error: ${geminiResponse.status} ${errorBody}`);
        }

        const geminiData = await geminiResponse.json();
        const location = geminiData.candidates[0].content.parts[0].text;
        res.json({ location });

    } catch (error) {
        console.error(`Error en /api/find-sac-chapter: ${error.message}`);
        res.status(500).json({ error: `Ocurrió un error interno: ${error.message}` });
    }
});

app.post('/api/generate-report', async (req, res) => {
  try {
    const { description, location, notes } = req.body;

    const apiKey = await getApiKey();
    const modelName = await chooseModel(apiKey);
    console.log(`Modelo seleccionado para generate-report: ${modelName}`);

    const contextList = [];
    // Carga de contexto con rutas relativas
    const contextPaths = {
      jurisprudence: path.join(__dirname, '..', 'conocimientos', 'jurisprudencia_tata_dga.txt'),
      legal: path.join(__dirname, '..', 'conocimientos', 'contexto_legal_sac.txt')
    };

    if (location) {
        const sectionMatch = location.match(/Sección ([IVXLCDM]+)/i);
        if (sectionMatch) {
            const sectionRoman = sectionMatch[1].toLowerCase();
            const sectionFileName = `sección_${sectionRoman}.txt`; // Asumiendo que este es el nombre correcto
            const sectionFilePath = path.join(__dirname, 'context_data', 'normativa_secciones', sectionFileName);
            if (fsSync.existsSync(sectionFilePath)) {
                contextList.push(sectionFilePath);
            }
        }
    }

    for (const key in contextPaths) {
        if (fsSync.existsSync(contextPaths[key])) {
            contextList.push(path.basename(contextPaths[key]));
        }
    }
    
    const PROMPT_VERSION = "1.0";
    const TIMESTAMP = new Date().toISOString();
    const safeDescription = description || '';
    const safeNotes = notes || '';

    const jsonTemplate = {
      metadata: { prompt_version: PROMPT_VERSION, model: modelName, timestamp: TIMESTAMP, raw_response_id: null },
      clasificacionPropuesta: {codigo: "string (8 o 10 dígitos)", descripcion: "string", unidad: "string", arancel_estimado: "string" },
      scoreFiabilidad: "integer 1..10",
      argumentoMerciologico: "string detallado",
      fundamentoLegal: { applied_rules: [], notes_applied: [] },
      analisisJurisprudencia: [],
      evidenciaClave: [],
      alternativas: [],
      flags: [],
      recomendaciones: [],
      conclusion: "string conciso",
      display_order: ["clasificacionPropuesta", "scoreFiabilidad", "argumentoMerciologico", "fundamentoLegal", "analisisJurisprudencia", "evidenciaClave", "alternativas", "flags", "recomendaciones", "conclusion"],
      raw_response: null
    };

    const prompt = `Eres un sistema experto en clasificación arancelaria. Analiza la descripción y genera un objeto JSON con la estructura solicitada.\nDescripción: ${safeDescription}. Notas: ${safeNotes}. Contexto: ${JSON.stringify(contextList)}.\nEstructura JSON requerida: \`\`\`json\n${JSON.stringify(jsonTemplate, null, 2)}\n\`\`\`\nFin del prompt. Devuelve únicamente el JSON solicitado.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
    const geminiResponse = await fetchWithTimeout(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    if (!geminiResponse.ok) {
        const errorBody = await geminiResponse.text();
        throw new Error(`API Error: ${geminiResponse.status} ${errorBody}`);
    }

    const geminiData = await geminiResponse.json();
    const rawReportText = geminiData.candidates[0].content.parts[0].text;
    
    let reportData;
    try {
      const jsonMatch = rawReportText.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        reportData = JSON.parse(jsonMatch[1]);
      } else {
        reportData = JSON.parse(rawReportText);
      }
    } catch (e) {
      console.error("Fallo al parsear el JSON de la respuesta de Gemini:", rawReportText);
      reportData = { 
        error: "Gemini no devolvió un JSON válido y completo.", 
        raw_response: rawReportText 
      };
    }

    res.json({ report: reportData });

  } catch (error) {
    console.error(`Error en /api/generate-report: ${error.message}`);
    res.status(500).json({ error: `Ocurrió un error interno: ${error.message}` });
  }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://127.0.0.1:${PORT}`);
});

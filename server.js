const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const fetch = require('node-fetch'); // Necesitarás instalar node-fetch: npm install node-fetch@2

// util para obtener API key del archivo credencialgemini
async function getApiKey() {
  const txt = await fs.readFile('credencialgemini', 'utf-8');
  const m = txt.match(/AIza[A-Za-z0-9_-]{35}/);
  return m ? m[0] : null;
}

// Llama ListModels y devuelve array de modelos (objeto crudo)
async function listModels(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`ListModels failed: ${r.status} ${body}`);
  }
  const data = await r.json();
  return data.models || [];
}

// Elige un modelo preferido (intenta listaPreferida y si no, busca 'flash' o usa gemini-pro)
async function chooseModel(apiKey) {
  const preferred = [
    "gemini-2.5-flash-preview-09-2025",
    "gemini-pro"
  ];
  const models = await listModels(apiKey);
  const names = models.map(m => m.name.replace("models/", "") || m.model.replace("models/", "") || "").filter(Boolean);

  // 1) buscar match exacto en preferred
  for (const p of preferred) if (names.includes(p)) return p;

  // 2) buscar modelo que contenga 'flash' y '2.5'
  const fuzzy = names.find(n => /flash/i.test(n) && /2(\.(5|5))/i.test(n));
  if (fuzzy) return fuzzy;

  // 3) buscar cualquier 'flash'
  const anyFlash = names.find(n => /flash/i.test(n));
  if (anyFlash) return anyFlash;

  // 4) fallback a gemini-pro si existe
  if (names.includes('gemini-pro')) return 'gemini-pro';

  // 5) si no se encontró nada útil, devuelve el primer modelo disponible
  if (names.length) return names[0];

  throw new Error('No se encontraron modelos disponibles en ListModels.');
}

const app = express();
const PORT = 5000;

// Middleware para parsear JSON y servir archivos estáticos
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'static')));

// Ruta principal para servir el index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// Ruta de la API para comunicarse con Gemini
app.post('/api/find-sac-chapter', async (req, res) => {
    try {
        const { description } = req.body;
        if (!description) {
            return res.status(400).json({ error: 'La descripción no puede estar vacía.' });
        }

        const apiKey = await getApiKey();
        if (!apiKey) {
            console.error("No se encontró una clave de API válida en el archivo credencialgemini.");
            return res.status(500).json({ error: 'Clave de API no encontrada o en formato incorrecto.' });
        }

        let modelName;
        try {
            modelName = await chooseModel(apiKey);
            console.log('Modelo seleccionado dinámicamente para find-sac-chapter:', modelName);
        } catch (e) {
            console.error('No se pudo elegir modelo:', e.message);
            modelName = 'gemini-pro'; // Fallback
        }

        // Leer el contexto del SAC
        const sacContextPath = '/data/data/com.termux/files/home/conocimientos/secciones-capitulos.json';
        const sacContextRaw = await fs.readFile(sacContextPath, 'utf-8');
        const sacContext = JSON.parse(sacContextRaw);

        const prompt = `
        Basado en el siguiente índice del Sistema Arancelario Centroamericano (SAC):
        ${JSON.stringify(sacContext, null, 2)}

        Analiza la siguiente descripción de mercancía:
        ''${description}''

        Tu tarea es identificar la Sección y el Capítulo más probables a los que pertenece esta mercancía.
        Responde únicamente con el formato: 'Ve a buscar a la Sección <número de sección en números romanos> y Capítulo <número de capítulo>'.
        Ejemplo de respuesta: 'Ve a buscar a la Sección IV y Capítulo 20'.
        `;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;

        const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error('Error de la API de Gemini:', errorText);
            throw new Error('La respuesta de la API de Gemini no fue exitosa.');
        }

        const geminiData = await geminiResponse.json();
        const location = geminiData.candidates[0].content.parts[0].text;

        res.json({ location });

    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).json({ error: 'Ocurrió un error interno.' });
    }
});

// Ruta de la API para generar el informe completo
app.post('/api/generate-report', async (req, res) => {
  try {
    const { description, location, notes } = req.body;

    const apiKey = await getApiKey();
    if (!apiKey) {
        console.error("No se encontró una clave de API válida en el archivo credencialgemini.");
        return res.status(500).json({ error: 'Clave de API no encontrada o en formato incorrecto.' });
    }

    let modelName;
    try {
        modelName = await chooseModel(apiKey);
        console.log('Modelo seleccionado dinámicamente para generate-report:', modelName);
    } catch (e) {
        console.error('No se pudo elegir modelo:', e.message);
        modelName = 'gemini-pro'; // Fallback
    }

    // --- Construcción del Embudo de Datos y Contexto para el Prompt ---
    const contextList = [];
    let specificSectionContent = 'No se encontró normativa específica para la sección.';
    try {
      const sectionMatch = location.match(/Sección ([IVXLCDM]+)/i);
      if (sectionMatch) {
        const sectionRoman = sectionMatch[1].toLowerCase();
        const sectionFilePath = path.join(__dirname, 'context_data', 'normativa_secciones', `sección_${sectionRoman}.txt`);
        if (fsSync.existsSync(sectionFilePath)) {
          specificSectionContent = await fs.readFile(sectionFilePath, 'utf-8');
          contextList.push(`normativa_secciones/sección_${sectionRoman}.txt`);
        }
      }
    } catch (e) {
      console.warn("No se pudo leer el archivo de contexto de sección específico.", e.message);
    }

    const jurisprudenceFilePath = '/data/data/com.termux/files/home/conocimientos/jurisprudencia_tata_dga.txt';
    if (fsSync.existsSync(jurisprudenceFilePath)) {
      contextList.push('jurisprudencia_tata_dga.txt');
    }

    const legalContextFilePath = '/data/data/com.termux/files/home/conocimientos/contexto_legal_sac.txt';
    if (fsSync.existsSync(legalContextFilePath)) {
      contextList.push('contexto_legal_sac.txt');
    }

    // Variables para el prompt
    const PROMPT_VERSION = "1.0";
    const MAX_CHARS_RESPONSE = 4000;
    const TIMESTAMP = new Date().toISOString();

    const safeDescription = description == null ? '' : description;
    const safeNotes = notes == null ? '' : notes;
    const contextListStr = JSON.stringify(contextList);

    const jsonTemplate = {
      metadata: {
        prompt_version: PROMPT_VERSION,
        model: modelName,
        timestamp: TIMESTAMP,
        raw_response_id: null
      },
      clasificacionPropuesta: {
        codigo: "string (8 o 10 dígitos, formato con puntos opcional)",
        descripcion: "string breve de la partida",
        unidad: "unidad de medida si aplica",
        arancel_estimado: "porcentaje o 'No disponible'"
      },
      scoreFiabilidad: "integer 1..10",
      score_desglose: {
        section_match: 0.0,
        notes_match: 0.0,
        rgi_application: 0.0,
        jurisprudence_support: 0.0,
        risk_assessment: 0.0,
        merciologic_coherence: 0.0
      },
      argumentoMerciologico: "string detallado",
      fundamentoLegal: {
        applied_rules: [
          {
            rule_id: "string (ej. RGI 1)",
            quote_or_reference: "texto exacto o referencia al archivo/lineas",
            file_source: "nombre_archivo",
            lines: [0, 0]
          }
        ],
        notes_applied: [
          {
            note_type: "Seccion/Capitulo/Complementaria",
            reference: "identificador de nota",
            file_source: "nombre_archivo",
            lines: [0, 0]
          }
        ]
      },
      analisisJurisprudencia: [
        {
          case_id: "string (si existe)",
          summary: "resumen del precedente y su aplicabilidad",
          support_level: "alto|medio|bajo",
          file_source: "nombre_archivo",
          lines: [0, 0]
        }
      ],
      evidenciaClave: [
        {
          type: "seccion|nota|jurisprudencia|normativa",
          file: "nombre_archivo",
          start_line: 0,
          end_line: 0,
          snippet: "texto exacto usado como evidencia",
          relevance: "alto|medio|bajo"
        }
      ],
      alternativas: [
        {
          codigo: "string alternativa",
          score_relativo: 0.0,
          razon_descartada: "texto explicativo breve",
          evidencia: []
        }
      ],
      flags: ["lista de alertas: barrera_no_arancelaria", "riesgo_alto"],
      recomendaciones: [
        "acciones concretas (p.ej. solicitar ficha técnica, prueba de laboratorio, revisar nota X)"
      ],
      conclusion: "resumen conciso (1-3 frases)",
      display_order: ["clasificacionPropuesta","scoreFiabilidad","argumentoMerciologico","fundamentoLegal","analisisJurisprudencia","evidenciaClave","alternativas","flags","recomendaciones","conclusion"],
      raw_response: null
    };

    const prompt = "" 
      + "Eres un sistema experto...\n"
      + "- description: " + JSON.stringify(safeDescription) + "\n"
      + "- notes: " + JSON.stringify(safeNotes) + "\n"
      + "- context_files: " + contextListStr + "\n"
      + "- model: " + modelName + "\n"
      + "JSON requerido:\n"
      + "```json\n"
      + JSON.stringify(jsonTemplate, null, 2) + "\n"
      + "```\n\n";

    const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      console.error('Error de la API de Gemini:', errorBody);
      throw new Error('Error en la API de Gemini');
    }

    const geminiData = await geminiResponse.json();
    const rawReportText = geminiData.candidates[0].content.parts[0].text;
    let reportData;
    try {
      const jsonMatch = rawReportText.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        reportData = JSON.parse(jsonMatch[1]);
      } else {
        // Fallback si no encuentra el bloque markdown, intenta parsear todo el texto.
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
    console.error('Error en el servidor al generar el informe:', error);
    res.status(500).json({ error: 'Ocurrió un error interno al generar el informe.' });
  }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://127.0.0.1:${PORT}`);
});
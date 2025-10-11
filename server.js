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
  const preferred = ["gemini-pro"]; // Simplificado para máxima compatibilidad en Vercel
  try {
    const models = await listModels(apiKey);
    const names = models.map(m => (m.name || m.model || "").replace("models/", "")).filter(Boolean);
    for (const p of preferred) {
      if (names.includes(p)) return p;
    }
    if (names.length > 0) return names[0];
    throw new Error('No models available for this API key.');
  } catch (error) {
    console.error(`Could not dynamically choose model: ${error.message}. Falling back to "gemini-pro".`);
    return 'gemini-pro';
  }
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
  const prompt = `Toma este código arancelario: "${arancelCode}" y el contexto legal provisto. Devuelve ÚNICAMENTE un JSON válido con la estructura: {"fundamentoLegal": {"applied_rules": [ { "rule_id": "...", "descripcion": "..." } ],
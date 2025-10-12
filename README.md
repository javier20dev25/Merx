# Merx v2.1 - Asistente de Clasificación Arancelaria

Merx es una aplicación web diseñada para asistir a expertos en aduanas y comercio exterior en la correcta clasificación arancelaria de mercancías. Utilizando la potencia de la API de Google Gemini, la aplicación analiza la descripción de un producto y propone un código arancelario, junto con el fundamento legal y merciológico correspondiente.

## ✨ Características Principales

- **Clasificación Inteligente:** Proporciona un código arancelario sugerido basado en la descripción de una mercancía.
- **Argumento Merciológico:** Genera una explicación técnica sobre por qué se asigna ese código.
- **Fundamento Legal:** Identifica y cita las Reglas Generales Interpretativas (RGI) y notas de sección/capítulo aplicables.
- **Interfaz Sencilla:** Una interfaz de usuario limpia y directa para realizar consultas rápidamente.
- **Sugerencia de Capítulo:** Una función auxiliar que sugiere la sección y capítulo del SAC donde se podría encontrar un producto.

## 🏛️ Arquitectura del Proyecto

El proyecto sigue una arquitectura de monolito simple, ideal para un despliegue rápido en plataformas como Vercel.

- **Backend:**
  - **Framework:** Node.js con Express.js.
  - **Lógica Principal:** El archivo `server.js` contiene toda la lógica del servidor, incluyendo la definición de los endpoints y la comunicación con la API de Gemini.
  - **Modelo de IA:** Utiliza el modelo `gemini-2.5-flash-lite` a través de llamadas directas a la API REST de Google.

- **Frontend:**
  - **Tecnología:** HTML, CSS y JavaScript vainilla.
  - **Ubicación:** Los archivos se encuentran en el directorio `public/` y `templates/`. La interfaz principal es `templates/index.html`.

- **Despliegue:**
  - **Plataforma:** Vercel.
  - **Integración:** El repositorio está enlazado a Vercel para despliegues automáticos con cada `git push` a la rama `main`.

## ⚙️ Endpoints de la API

La aplicación expone los siguientes endpoints bajo el prefijo `/api`:

- `POST /api/generate-report`: El endpoint principal. Recibe una descripción de la mercancía y devuelve un informe completo con la clasificación, argumento y fundamento legal.
- `POST /api/find-sac-chapter`: Un endpoint auxiliar que recibe una descripción y devuelve una sugerencia de Sección y Capítulo del Sistema Armonizado (SAC).
- `GET /api/debug-env`: Un endpoint de depuración para verificar la presencia de la clave de API en el entorno del servidor.

## 🚀 Instalación y Uso Local

Para ejecutar este proyecto en un entorno local, sigue estos pasos:

1.  **Clonar el repositorio:**
    ```bash
    git clone https://github.com/javier20dev25/Merx.git
    cd Merx
    ```

2.  **Instalar dependencias:**
    ```bash
    npm install
    ```

3.  **Configurar la API Key:**
    Crea un archivo llamado `credencialgemini` en la raíz del proyecto y pega tu clave de API de Google Gemini dentro. Alternativamente, puedes configurar la variable de entorno `GEMINI_API_KEY`.

4.  **Iniciar el servidor:**
    ```bash
    npm start
    ```
    El servidor se iniciará en el puerto 5000 por defecto.

## 📜 Scripts de NPM

- `npm start`: Inicia el servidor de Node.js.
- `npm run logs`: (Funcionalidad para producción) Muestra los logs en tiempo real del despliegue en Vercel.
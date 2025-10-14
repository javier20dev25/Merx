# Merx v2.1

## Descripción

Merx es una herramienta de análisis aduanero impulsada por un modelo de lenguaje (IA), diseñada con fines educativos y como un proyecto de estudio para explorar las capacidades de la IA en el campo del comercio exterior.

**Aviso Importante:** La información proporcionada por esta herramienta, incluyendo las clasificaciones arancelarias y los análisis legales, es generada por IA y no constituye una asesoría legal o profesional. No debe ser utilizada para tomar decisiones comerciales o fiscales reales. El uso de esta herramienta es bajo su propio riesgo.

Este es un proyecto de código abierto. Le animamos a revisar el código, experimentar y contribuir.

## Arquitectura del Proyecto

El proyecto está construido con una arquitectura simple y funcional, separada en un frontend estático y un backend de Node.js.

-   **Frontend:** Una interfaz de usuario limpia construida con **HTML, CSS y JavaScript puro**. No se utilizan frameworks de frontend. Los archivos principales se encuentran en `templates/index.html` y `public/static/`.

-   **Backend:** Un servidor de **Node.js** con **Express**, responsable de recibir las solicitudes del usuario y orquestar el flujo de análisis con la IA.

## Base de Conocimiento

El razonamiento de la IA se guía por un conjunto de archivos de texto (`.txt`) y JSON ubicados en el directorio `conocimientos/`. Estos archivos actúan como el contexto fundamental para las diferentes fases del análisis. Cada archivo tiene un propósito específico:

*   `razonamiento_rgi_avanzado.txt`: Es el documento clave para el "paso uno". Proporciona el marco para el **análisis merciológico** (el estudio de la naturaleza, función y composición de la mercancía) y contiene la lógica avanzada para aplicar las Reglas Generales Interpretativas (RGI). Es el "cerebro" de la clasificación arancelaria.
*   `jurisprudencia_tata_dga.txt`: Provee un contexto legal crucial con casos y sentencias reales del Tribunal Aduanero y Tributario Administrativo (TATA) de Nicaragua, permitiendo a la IA citar precedentes en disputas de valoración y clasificación.
*   `contexto_legal_sac.txt`: Describe la estructura y jerarquía del Sistema Arancelario Centroamericano (SAC), que es la base para la clasificación de mercancías en la región.
*   `analisis_riesgo_tecnico_comercial.txt`: Detalla las barreras no arancelarias en Nicaragua, como controles sanitarios (MINSA), fitosanitarios (IPSA) y ambientales (MARENA), y los permisos que se requieren.
*   `gestion_riesgos_aduaneros_ni.txt`: Explica el modelo de gestión de riesgos que utiliza la aduana de Nicaragua (DGA), basado en estándares de la Organización Mundial de Aduanas (OMA). Ayuda a la IA a predecir el nivel de riesgo de una importación (selectividad de canal verde, amarillo o rojo).
*   `regimenes_preferenciales_ni.txt`: Contiene información sobre tratados de libre comercio (como CAFTA-DR) y regímenes de incentivos nacionales (como Zonas Francas) para identificar oportunidades de optimización de aranceles.
*   `resumen_notas_legales_sac.txt`: Proporciona un resumen de las notas legales del SAC, utilizado por una función auxiliar para sugerir rápidamente el capítulo arancelario de un producto.

Los archivos JSON (`tipos-de-notas.json`, `secciones-capitulos.json`) proveen datos estructurados que el sistema utiliza para complementar los análisis. Los archivos no mencionados en esta lista actualmente no son utilizados por el servidor.

## Flujo del Servidor

Cuando un usuario solicita un informe, el backend no realiza una única consulta a la IA. En su lugar, ejecuta un flujo de análisis multi-fase para construir un informe robusto y detallado:

1.  **Fase 1: Clasificación Inicial**
    -   El servidor toma la descripción de la mercancía y las notas del usuario.
    -   Consulta a la IA, utilizando el contexto de `razonamiento_rgi_avanzado.txt`, para obtener una propuesta de código arancelario.

2.  **Fase 2: Análisis Paralelo**
    -   Con el código arancelario obtenido, el servidor ejecuta 4 análisis especializados de forma simultánea para mayor eficiencia:
        -   **Análisis Legal:** Busca el fundamento legal, incluyendo reglas, notas y jurisprudencia relevante (`jurisprudencia_tata_dga.txt`, `contexto_legal_sac.txt`).
        -   **Análisis Regulatorio:** Identifica posibles permisos, barreras no arancelarias y riesgos técnicos (`analisis_riesgo_tecnico_comercial.txt`).
        -   **Análisis de Riesgo:** Evalúa los riesgos inherentes a la mercancía (`gestion_riesgos_aduaneros_ni.txt`).
        -   **Análisis de Optimización:** Busca oportunidades en regímenes preferenciales y tratados comerciales (`regimenes_preferenciales_ni.txt`).

3.  **Fase 3: Consolidación y Entrega**
    -   El servidor recoge los resultados de todas las fases, los estructura en un formato coherente y los envía al frontend para ser mostrados al usuario.

## Configuración

### API Key de Gemini

Para que el proyecto funcione, es necesaria una API Key de Google Gemini. El servidor está programado para buscar esta clave en dos lugares, en el siguiente orden de prioridad:

1.  **Variable de Entorno (Recomendado para producción):** Una variable de entorno llamada `GEMINI_API_KEY`.
2.  **Archivo Local (Para desarrollo):** Un archivo llamado `credencialgemini` ubicado en la raíz del proyecto. Simplemente pega tu clave dentro de este archivo.

## Cómo Contribuir

Este es un proyecto de código abierto y las contribuciones son bienvenidas. El proceso recomendado para proponer mejoras es a través de Pull Requests en GitHub.

1.  **Haz un Fork:** Crea una copia (fork) de este repositorio en tu propia cuenta de GitHub.
2.  **Clona tu Fork:** Descarga tu copia del repositorio a tu máquina local.
    ```bash
    git clone https://github.com/TU_USUARIO/Merx.git
    ```
3.  **Crea una Nueva Rama:** Antes de hacer cambios, crea una rama para tu nueva función o arreglo.
    ```bash
    git checkout -b mi-nueva-funcionalidad
    ```
4.  **Realiza tus Cambios:** Modifica el código, añade funciones o mejora la documentación.
5.  **Envía un Pull Request:** Sube tus cambios a tu fork y abre un "Pull Request" desde tu rama hacia la rama `main` del repositorio original. Tu propuesta será revisada y, si es aprobada, integrada al proyecto.

### Añadir Nuevas Bases de Conocimiento

Mejorar la IA es tan simple como mejorar su material de estudio. Para añadir nuevo conocimiento:

-   Añade nuevos archivos `.txt` o `.json` al directorio `conocimientos/`.
-   Modifica el código en `server.js` para cargar tu nuevo archivo y, si es necesario, crea una nueva fase en el flujo del servidor que lo utilice en un nuevo prompt.

## Scripts Disponibles

Puedes ejecutar los siguientes comandos desde la raíz del proyecto:

-   `npm start`: Inicia el servidor local de Node.js.
-   `npm run logs`: Muestra los logs en tiempo real del despliegue en Vercel (requiere tener Vercel CLI instalado y configurado).


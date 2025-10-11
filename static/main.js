document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Selección de Elementos del DOM ---
    const infoText = document.getElementById('info-text');
    const mainTextarea = document.getElementById('main-textarea');
    const resultContainer = document.getElementById('result-container');
    const leftButton = document.getElementById('left-button');
    const rightButton = document.getElementById('right-button');
    const mainContainer = document.getElementById('main-container');
    const reportView = document.getElementById('report-view');
    const resetButton = document.getElementById('reset-button');

    const leftButtonContent = leftButton.querySelector('span');
    const rightButtonContent = rightButton.querySelector('span');

    const trashIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;
    const backIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`;

    let currentState = -1;
    let subState = 0; // 0: input, 1: result
    let sessionData = { description: '', location: '' }; // Objeto para guardar datos

    // --- 2. Animaciones y Transiciones ---
    function animateTextChange(element, newText) {
        if (element.innerHTML === newText) return;
        element.classList.add('fade-out');
        element.addEventListener('animationend', () => {
            element.innerHTML = newText;
            element.classList.remove('fade-out');
            element.classList.add('fade-in');
        }, { once: true });
    }

    function animateContentChange(element, newContent) {
        if (element.innerHTML === newContent) return;
        element.classList.add('fade-out');
        element.addEventListener('animationend', () => {
            element.innerHTML = newContent;
            element.classList.remove('fade-out');
            element.classList.add('fade-in');
        }, { once: true });
    }

    function transitionElements(hideEl, showEl) {
        hideEl.classList.add('fade-out');
        hideEl.addEventListener('animationend', () => {
            hideEl.classList.add('hidden');
            hideEl.classList.remove('fade-out');
            showEl.classList.remove('hidden');
            showEl.classList.add('fade-in');
        }, { once: true });
    }

    // --- 3. Lógica de la API ---
    async function findSacLocation() {
        sessionData.description = mainTextarea.value; // Guardar descripción
        if (!sessionData.description.trim()) {
            return;
        }

        // Inicia estado de carga con nueva animación
        transitionElements(mainTextarea, resultContainer);
        resultContainer.innerHTML = `<div class="loader"><div class="dot1"></div><div class="dot2"></div><div class="dot3"></div></div>`;
        rightButton.disabled = true;

        try {
            const response = await fetch('/api/find-sac-chapter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: sessionData.description })
            });

            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.statusText}`);
            }

            const data = await response.json();
            sessionData.location = data.location || 'No se encontró ubicación.'; // Guardar ubicación

            // Formatea el resultado para que tenga dos líneas
            const formattedLocation = sessionData.location.replace(' y ', '<br>');
            resultContainer.innerHTML = `<p class="result-text">${formattedLocation}</p>`;
            animateTextChange(rightButtonContent, "Siguiente");
            subState = 1;

        } catch (error) {
            resultContainer.innerHTML = `<p class="result-text" style="color: #ffb8b8;">Error al buscar</p>`;
            console.error('Error en findSacLocation:', error);
        } finally {
            rightButton.disabled = false;
        }
    }

    // --- 4. Lógica de Generación de Informe ---
    async function generateReport() {
        const notes = mainTextarea.value;

        // 1. Iniciar transición a la vista de informe y mostrar loader
        mainContainer.classList.add('fade-out');
        mainContainer.addEventListener('animationend', () => {
            mainContainer.classList.add('hidden');
            mainContainer.classList.remove('fade-out');
            
            reportView.classList.remove('hidden');
            const reportWrapper = document.getElementById('report-content-wrapper');
            reportWrapper.innerHTML = `<div class="loader"><div class="dot1"></div><div class="dot2"></div><div class="dot3"></div></div>`;
            reportView.classList.add('fade-in');
        }, { once: true });

        try {
            // 2. Llamar a la API para generar el informe
            const response = await fetch('/api/generate-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    description: sessionData.description,
                    location: sessionData.location,
                    notes: notes
                })
            });

            if (!response.ok) throw new Error('Error del servidor al generar el informe');

            const data = await response.json();
            const reportData = data.report;

            // 3. Mostrar el informe final estructurado
            const reportWrapper = document.getElementById('report-content-wrapper');
            reportWrapper.innerHTML = ''; // Limpiar el loader

            let reportHtml = '';

            // Función auxiliar para renderizar secciones
            const renderSection = (title, content, isHtml = false) => {
                if (content) {
                    reportHtml += `<div class="report-section-title">${title}</div>`;
                    reportHtml += `<div class="report-section-content">${isHtml ? content : content.replace(/\n/g, '<br>')}</div>`;
                }
            };

            // Clasificación Propuesta
            if (reportData.clasificacionPropuesta && reportData.clasificacionPropuesta.codigo) {
                reportHtml += `<div class="report-section-title">Clasificación Arancelaria Propuesta:</div>`;
                reportHtml += `<div class="report-section-content">Código: <strong>${reportData.clasificacionPropuesta.codigo}</strong><br>`;
                if (reportData.clasificacionPropuesta.descripcion) reportHtml += `Descripción: ${reportData.clasificacionPropuesta.descripcion}<br>`;
                if (reportData.clasificacionPropuesta.unidad) reportHtml += `Unidad: ${reportData.clasificacionPropuesta.unidad}<br>`;
                if (reportData.clasificacionPropuesta.arancel_estimado) reportHtml += `Arancel Estimado: ${reportData.clasificacionPropuesta.arancel_estimado}`; 
                reportHtml += `</div>`;
            }

            // Score de Fiabilidad
            if (reportData.scoreFiabilidad) {
                let scoreClass = 'score-red';
                if (reportData.scoreFiabilidad >= 8) scoreClass = 'score-green';
                else if (reportData.scoreFiabilidad >= 5) scoreClass = 'score-yellow';
                reportHtml += `<div class="report-section-title">Score de Fiabilidad:</div>`;
                reportHtml += `<div class="score-display ${scoreClass}">${reportData.scoreFiabilidad}/10</div>`;
            }

            // Argumento Merciológico
            renderSection('Argumento Merciológico:', reportData.argumentoMerciologico);

            // Fundamento Legal
            if (reportData.fundamentoLegal) {
                reportHtml += `<div class="report-section-title">Fundamento Legal:</div>`;
                if (reportData.fundamentoLegal.applied_rules && reportData.fundamentoLegal.applied_rules.length > 0) {
                    reportHtml += `<div class="report-section-content"><strong>Reglas Aplicadas:</strong><ul>`;
                    reportData.fundamentoLegal.applied_rules.forEach(rule => {
                        reportHtml += `<li>${rule.rule_id}: ${rule.quote_or_reference} (Fuente: ${rule.file_source || 'N/A'})</li>`;
                    });
                    reportHtml += `</ul></div>`;
                }
                if (reportData.fundamentoLegal.notes_applied && reportData.fundamentoLegal.notes_applied.length > 0) {
                    reportHtml += `<div class="report-section-content"><strong>Notas Aplicadas:</strong><ul>`;
                    reportData.fundamentoLegal.notes_applied.forEach(note => {
                        reportHtml += `<li>${note.note_type}: ${note.reference} (Fuente: ${note.file_source || 'N/A'})</li>`;
                    });
                    reportHtml += `</ul></div>`;
                }
            }

            // Análisis de Jurisprudencia
            if (reportData.analisisJurisprudencia && reportData.analisisJurisprudencia.length > 0) {
                reportHtml += `<div class="report-section-title">Análisis de Jurisprudencia:</div>`;
                reportHtml += `<div class="report-section-content"><ul>`;
                reportData.analisisJurisprudencia.forEach(caseItem => {
                    reportHtml += `<li><strong>${caseItem.case_id || 'Caso sin ID'}:</strong> ${caseItem.summary} (Fuente: ${caseItem.file_source || 'N/A'})</li>`;
                });
                reportHtml += `</ul></div>`;
            }

            // Evidencia Clave
            if (reportData.evidenciaClave && reportData.evidenciaClave.length > 0) {
                reportHtml += `<div class="report-section-title">Evidencia Clave:</div>`;
                reportHtml += `<div class="report-section-content"><ul>`;
                reportData.evidenciaClave.forEach(evidence => {
                    reportHtml += `<li><strong>${evidence.type}:</strong> ${evidence.snippet} (Fuente: ${evidence.file || 'N/A'}, Líneas: ${evidence.start_line}-${evidence.end_line})</li>`;
                });
                reportHtml += `</ul></div>`;
            }

            // Alternativas
            if (reportData.alternativas && reportData.alternativas.length > 0) {
                reportHtml += `<div class="report-section-title">Alternativas:</div>`;
                reportHtml += `<div class="report-section-content"><ul>`;
                reportData.alternativas.forEach(alt => {
                    reportHtml += `<li><strong>${alt.codigo}:</strong> ${alt.razon_descartada} (Score Relativo: ${alt.score_relativo})</li>`;
                });
                reportHtml += `</ul></div>`;
            }

            // Flags
            if (reportData.flags && reportData.flags.length > 0) {
                reportHtml += `<div class="report-section-title">Alertas/Flags:</div>`;
                reportHtml += `<div class="report-section-content"><ul>`;
                reportData.flags.forEach(flag => {
                    reportHtml += `<li>${flag}</li>`;
                });
                reportHtml += `</ul></div>`;
            }

            // Recomendaciones
            renderSection('Recomendaciones:', reportData.recomendaciones);

            // Conclusión
            renderSection('Conclusión:', reportData.conclusion);

            reportWrapper.innerHTML = reportHtml;

        } catch (error) {
            const reportWrapper = document.getElementById('report-content-wrapper');
            reportWrapper.innerHTML = `<p class="report-final-text" style="color: #c0392b;">Error al generar el informe. Asegúrate de que Gemini devuelva un JSON válido.</p>`;
            console.error('Error en generateReport:', error);
        }
    }

    // --- 5. Manejo de Estados de UI ---
    function updateUI(state) {
        const oldState = currentState;
        if (oldState === state && oldState !== -1) {
             return;
        }
        currentState = state;

        if (state === 0) {
            subState = 0;
            mainContainer.classList.remove('hidden');
            reportView.classList.add('hidden');
            infoText.classList.add('hidden');
            mainTextarea.classList.remove('tall');
            mainTextarea.placeholder = "Describe tu mercancía aquí";
            mainTextarea.value = "";
            resultContainer.classList.add('hidden');
            mainTextarea.classList.remove('hidden');

            animateContentChange(leftButtonContent, trashIcon);
            animateTextChange(rightButtonContent, "Buscar Ubicacion");
            leftButton.setAttribute('aria-label', 'Limpiar campo');
        } else if (state === 1) {
            mainContainer.classList.remove('hidden');
            reportView.classList.add('hidden');
            infoText.classList.remove('hidden');
            mainTextarea.classList.add('tall');
            mainTextarea.value = '';
            mainTextarea.placeholder = "Ej: 8528.72.00.00 - Nota 2 a) de la Sección XVI...";
            resultContainer.classList.add('hidden');
            mainTextarea.classList.remove('hidden');

            animateContentChange(leftButtonContent, backIcon);
            animateTextChange(rightButtonContent, "Generar informe");
            leftButton.setAttribute('aria-label', 'Retroceder');
        }
    }

    // --- 6. Asignación de Eventos ---
    rightButton.addEventListener('click', () => {
        if (currentState === 0) {
            if (subState === 0) {
                findSacLocation();
            } else {
                mainContainer.classList.add('fade-out');
                mainContainer.addEventListener('animationend', () => {
                    updateUI(1);
                    mainContainer.classList.remove('fade-out');
                    mainContainer.classList.add('fade-in');
                }, { once: true });
            }
        } else if (currentState === 1) {
            generateReport();
        }
    });

    leftButton.addEventListener('click', () => {
        if (currentState === 0) {
            if (subState === 0) { // Limpiar
                if (mainTextarea.value !== '') {
                    mainTextarea.classList.add('clearing');
                    setTimeout(() => { mainTextarea.value = ''; }, 200);
                    mainTextarea.addEventListener('animationend', () => mainTextarea.classList.remove('clearing'), { once: true });
                }
            } else { // Volver al input desde el resultado
                transitionElements(resultContainer, mainTextarea);
                animateTextChange(rightButtonContent, "Buscar Ubicacion");
                subState = 0;
            }
        }
    });

    resetButton.addEventListener('click', () => {
        reportView.classList.add('fade-out');
        reportView.addEventListener('animationend', () => {
            reportView.classList.add('hidden');
            reportView.classList.remove('fade-out');
            mainContainer.classList.remove('hidden');
            mainContainer.classList.add('fade-in');
            updateUI(0);
        }, { once: true });
    });

    // --- 7. Inicialización ---
    updateUI(0);
});
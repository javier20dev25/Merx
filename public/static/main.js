document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos del DOM ---
    const step1Container = document.getElementById('step-1-container');
    const mainTextarea = document.getElementById('main-textarea');
    const step3Container = document.getElementById('step-3-container');
    const notesTextarea = document.getElementById('notes-textarea');
    if (notesTextarea) {
        notesTextarea.setAttribute('placeholder', 'Pega las OPCIONES ARANCELARIAS que consideras aquí (ej. 0701.10.00.00). Las Notas Legales se incluirán automáticamente.');
    }
    const clarificationContainer = document.getElementById('clarification-container');
    const clarificationReason = document.getElementById('clarification-reason');
    const clarificationQuestions = document.getElementById('clarification-questions');
    const resultCard = document.getElementById('result-card');
    const leftButton = document.getElementById('left-button');
    const rightButton = document.getElementById('right-button');
    const skipButton = document.getElementById('skip-button');
    const mainContainer = document.getElementById('main-container');
    const reportView = document.getElementById('report-view');
    const resetButton = document.getElementById('reset-button');
    const pasteButton = document.getElementById('paste-button');
    const reportAccordion = document.getElementById('report-accordion');
    const dynamicAcademy = document.getElementById('dynamic-academy');
    const dynamicLessonContent = document.getElementById('dynamic-lesson-content');
    const logo = document.getElementById('logo');
    const merxAcademy = document.getElementById('merx-academy');
    const repasoBtn = document.getElementById('repaso-btn');
    const closeAcademyBtn = document.getElementById('close-academy');

    // Academy Elements
    const academyDescription = document.getElementById('academy-description');
    const levelBtns = document.querySelectorAll('.level-btn');
    const blocksPool = document.getElementById('blocks-pool');
    const blocksResult = document.getElementById('blocks-result');
    const resetGameBtn = document.getElementById('reset-game');

    const leftButtonContent = leftButton.querySelector('span');
    const rightButtonContent = rightButton.querySelector('span');
    const pasteButtonContent = pasteButton.querySelector('span');

    // --- Iconos SVG ---
    const trashIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;
    const backIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`;
    const clipboardIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clipboard-paste"><path d="M10 2v4a2 2 0 0 1-2 2H4"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8"/><rect width="8" height="4" x="8" y="2" rx="1"/></svg>`;
    pasteButtonContent.innerHTML = clipboardIcon;

    // --- Estado de la App ---
    let currentState = 0;
    let classificationResult = null;
    let sessionData = { description: '', location: '' };

    const academyData = {
        tecnico: "Estructura legal: Secciones, Capítulos (2 dígs), Partidas (4 dígs), Subpartidas (6 dígs) e Incisos (10-12 dígs). Basado en RGI y Notas Legales.",
        sencillo: "El SAC es como un mapa: Barrios (Secciones), Calles (Capítulos) y Casas (Incisos). Los primeros 4 números son el 'apellido' de la familia.",
        adolescente: "Es como Spotify: Sección = Género, Capítulo = Banda, Inciso = ID de la canción. La Partida es el título del álbum."
    };

    const structureLevels = [
        { id: 'sec', name: 'Sección (Grupo)', order: 1 },
        { id: 'cap', name: 'Capítulo (Familia)', order: 2 },
        { id: 'par', name: 'Partida (Categoría)', order: 3 },
        { id: 'sub', name: 'Subpartida (Mundial)', order: 4 },
        { id: 'inc', name: 'Inciso (Nacional)', order: 5 }
    ];

    let gameOrder = [];

    // --- Funciones de UI ---
    function animateTextChange(element, newText) {
        if (element.innerHTML === newText) return;
        element.classList.add('fade-out');
        element.addEventListener('animationend', () => {
            element.innerHTML = newText;
            element.classList.remove('fade-out');
            element.classList.add('fade-in');
        }, { once: true });
    }

    function transitionElements(hideEl, showEl) {
        if (!hideEl || !showEl) return;
        hideEl.classList.add('fade-out');
        hideEl.addEventListener('animationend', () => {
            hideEl.classList.add('hidden');
            hideEl.classList.remove('fade-out');
            showEl.classList.remove('hidden');
            showEl.classList.add('fade-in');
        }, { once: true });
    }

    // --- Lógica Principal ---
    async function findSacLocation() {
        sessionData.description = mainTextarea.value;
        if (!sessionData.description.trim()) return;

        logo.classList.add('loading-animation');

        transitionElements(step1Container, resultCard);
        resultCard.innerHTML = '';
        rightButton.disabled = true;

        try {
            const response = await fetch('/api/find-sac-chapter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: sessionData.description })
            });

            if (!response.ok) throw new Error(`Error del servidor: ${response.statusText}`);

            const data = await response.json();

            let uiText;
            if (data.section || data.chapter) {
                const section = data.section || '—';
                const chapter = data.chapter || '—';
                const chapter_number = data.chapter_number;
                const rationale = data.rationale || '';
                const chapterText = chapter_number ? `Capítulo ${chapter_number}: ${chapter}` : `Capítulo: ${chapter}`;

                uiText = `<strong>Sección:</strong> ${section}<br><strong>${chapterText}</strong>`;
                if (rationale) {
                    uiText += `<br><br><div class="neumorphic-data-card" style="margin-bottom:0;"><strong class="data-label">Análisis Merceológico Inicial</strong><span class="data-value">${rationale}</span></div>`;
                }

                if (data.notasSugeridas && data.notasSugeridas.length > 1 && rationale.toLowerCase().includes("ambigu")) {
                    uiText += `<div style="margin-top:15px; padding:10px; background:rgba(138,43,226,0.1); border-radius:8px; border-left: 3px solid #8A2BE2;">
                                 <strong style="color:#8A2BE2; font-size:0.9em;">¡Múltiples Opciones Detectadas!</strong><br>
                                 <small>Tu descripción puede clasificar en varios capítulos. Revisa las <strong>Notas Legales Clave</strong> abajo para determinar a cuál aplica realmente tu producto, y pega la opción correcta en el paso final.</small>
                               </div>`;
                }
                if (data.notasSugeridas && data.notasSugeridas.length > 0) {
                    const notasHtml = data.notasSugeridas.map(n => `<li style="margin-bottom: 8px;"><strong style="color:var(--primary-color)">[${n.tipo}]</strong> ${n.texto}</li>`).join('');
                    uiText += `<br><br><strong>Notas Legales Clave:</strong><br><ul style="font-size:0.9em; opacity:0.9; max-height:200px; overflow-y:auto; padding-left:20px; padding-top:10px; padding-bottom:10px; background:rgba(0,0,0,0.2); border-radius:8px; border-left: 3px solid var(--primary-color);">${notasHtml}</ul>`;
                } else if (data.extractedNotes) {
                    uiText += `<br><br><strong>Notas Legales (Resumen):</strong><br><div style="font-size:0.9em; opacity:0.9; max-height:200px; overflow-y:auto; padding:10px; background:rgba(0,0,0,0.2); border-radius:8px; border-left: 3px solid var(--primary-color);">${data.extractedNotes.replace(/\n/g, '<br>')}</div>`;
                }
                sessionData.extractedNotes = data.extractedNotes || '';
            } else if (data.raw_text) {
                uiText = data.raw_text;
            } else {
                uiText = 'No se encontró clasificación confiable.';
            }

            resultCard.innerHTML = uiText;
            sessionData.location = uiText;
            updateUI(1);

        } catch (error) {
            resultCard.innerText = 'Error al procesar la respuesta del servidor.';
            console.error('Error en findSacLocation:', error);
        } finally {
            rightButton.disabled = false;
            logo.classList.remove('loading-animation');
        }
    }

    function showError(message) {
        const reportWrapper = document.getElementById('report-content-wrapper');
        reportWrapper.innerHTML = `<p class="report-final-text" style="color: #c0392b;">${message}</p>`;
    }

    async function generateReport(skip = false) {
        let notes = notesTextarea.value;
        if (sessionData.extractedNotes) {
            notes += `\n\n[CONTEXTO INTERNO: TEXTO COMPLETO DE NOTAS LEGALES]\n${sessionData.extractedNotes}`;
        }

        let clarificationAnswers = "";
        if (currentState === 1.5) {
            if (skip) {
                clarificationAnswers = "[USUARIO OMITIÓ DAR DETALLES TÉCNICOS. PROCEDE A CLASIFICAR CON LA INFORMACIÓN ACTUAL BASÁNDOTE EN TU MEJOR CRITERIO TÉCNICO]";
            } else {
                const inputs = clarificationQuestions.querySelectorAll('input[type="radio"]:checked, textarea.neumorphic-textarea');
                inputs.forEach(input => {
                    const QuestionText = input.closest('div').querySelector('.question-label') ? input.closest('div').querySelector('.question-label').innerText : "Pregunta Abierta";
                    if (input.type === 'radio') {
                        if (input.value === 'Otro') {
                            const otherInput = input.closest('label').querySelector('.other-text-input');
                            clarificationAnswers += `${QuestionText}: Otro - ${otherInput.value || 'No especificado'}\n`;
                        } else {
                            clarificationAnswers += `${QuestionText}: ${input.value}\n`;
                        }
                    } else {
                        clarificationAnswers += `${QuestionText}: ${input.value}\n`;
                    }
                });
            }
        }

        mainContainer.classList.add('fade-out');
        mainContainer.addEventListener('animationend', () => {
            mainContainer.classList.add('hidden');
            mainContainer.classList.remove('fade-out');

            reportView.classList.remove('hidden');
            reportAccordion.innerHTML = `<div class="loader-container"><div class="neumorphic-spinner"></div></div>`;
            reportView.classList.add('fade-in');
            logo.classList.add('loading-animation');
        }, { once: true });

        try {
            const payload = {
                description: sessionData.description,
                notes: notes,
                origen: 'No especificado',
                perfilImportador: 'General',
                clarificationAnswers: clarificationAnswers
            };
            const resp = await fetch('/api/generate-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

            if (!resp.ok) {
                const errData = await resp.json();
                throw new Error(errData.message || `Error del servidor: ${resp.statusText}`);
            }

            const data = await resp.json();

            if (!data.ok || !data.report) {
                showError('El servidor devolvió una respuesta inválida o incompleta.');
                return;
            }

            const report = data.report;
            classificationResult = report.classification;

            if (classificationResult?.necesitaAclaracion) {
                reportView.classList.add('hidden');
                mainContainer.classList.remove('hidden');
                showClarificationPrompt(classificationResult);
                return;
            }

            // Limpiar y preparar acordeón
            reportAccordion.innerHTML = '';
            updateUI(2);

            // 1. Identificación Merceológica
            const notasDuda = classificationResult.analisisMerciologico?.comentariosDuda;
            let idContent = `<div class="neumorphic-data-card">
                                <span class="data-label">Identificación Técnica</span>
                                <p class="data-value">${classificationResult.analisisMerciologico?.identificacion || 'No disponible'}</p>
                             </div>`;
            if (notasDuda && notasDuda !== "N/A" && notasDuda !== "false" && notasDuda.trim() !== '') {
                idContent += `<div class="risk-box" style="border-left-color: #ff9800;">
                                <div class="risk-title">💡 Alerta del Sistema (Deducción)</div>
                                <div class="data-value" style="font-size: 0.95rem;">${notasDuda}</div>
                              </div>`;
            }
            reportAccordion.appendChild(createAccordionItem('1. Identificación Merceológica', idContent));

            // 2. Clasificación Legal
            let legalContent = `<div class="merx-code-display">
                                    <span class="data-label" style="margin-bottom: 0;">Código Merx Propuesto</span>
                                    <div class="merx-code-number">${classificationResult.clasificacionPropuesta?.codigo || 'N/A'}</div>
                                    <p class="data-value" style="text-align: center; max-width: 90%; margin-top: 10px;">${classificationResult.clasificacionPropuesta?.descripcion || ''}</p>
                                </div>`;

            legalContent += `<div class="neumorphic-data-card">
                                <span class="data-label">Justificación Técnica</span>
                                <p class="data-value">${classificationResult.argumentoMerciologico || ''}</p>
                             </div>`;

            legalContent += `<div class="neumorphic-data-card">
                                <span class="data-label">Base Legal Citada</span>
                                <p class="data-value" style="font-size: 0.9em; color: #666;">${classificationResult.baseLegalCitada || ''}</p>
                             </div>`;

            legalContent += `<div class="neumorphic-data-card">
                                <span class="data-label">Análisis de Integridad (RGI)</span>
                                <p class="data-value"><strong>RGI Aplicada:</strong> ${classificationResult.rgiExacta || 'No especificada'}<br><br>${classificationResult.evaluacionRGI1 || ''}</p>
                             </div>`;

            if (classificationResult.prelacionLegal && classificationResult.prelacionLegal !== 'N/A') {
                legalContent += `<div class="risk-box" style="border-left-color: #d35400;">
                                    <div class="risk-title">⚖️ Prelación Legal Automática</div>
                                    <div class="data-value" style="font-size: 0.95rem;">${classificationResult.prelacionLegal}</div>
                                 </div>`;
            }

            reportAccordion.appendChild(createAccordionItem('2. Fundamento Legal (RGI/SAC)', legalContent));

            // 3. Riesgos y Permisos
            if (report.risk && !report.risk.error) {
                const riskContent = report.risk.analisisRiesgoMercancia?.map(r =>
                    `<div class="risk-box">
                        <div class="risk-title">${r.riesgoIdentificado}</div>
                        <div class="data-value" style="font-size: 0.95rem;">${r.justificacion}</div>
                        <div class="risk-tip">💡 <strong>Recomendación DGA:</strong> ${r.recomendacion}</div>
                    </div>`
                ).join('') || '<div class="neumorphic-data-card">No se detectaron riesgos especiales de fiscalización.</div>';
                reportAccordion.appendChild(createAccordionItem('3. Gestión de Riesgos y Permisos (DGA)', riskContent));
            }

            // 4. Liquidación y Aranceles
            let taxInfo = parseSacTaxes(notesTextarea.value);
            let taxContent = `<div class="neumorphic-data-card"><span class="data-label">Impuestos Base</span>`;

            if (taxInfo) {
                taxContent += `<div class="tax-grid">
                                    <div class="tax-item">
                                        <span class="tax-item-label">DAI</span>
                                        <span class="tax-item-value">${taxInfo.dai}%</span>
                                    </div>
                                    <div class="tax-item">
                                        <span class="tax-item-label">ISC</span>
                                        <span class="tax-item-value">${taxInfo.isc}%</span>
                                    </div>
                                    <div class="tax-item">
                                        <span class="tax-item-label">IVA</span>
                                        <span class="tax-item-value">${taxInfo.iva}%</span>
                                    </div>
                               </div></div>`;
            } else {
                taxContent += `<p class="data-value"><em>No se detectaron aranceles en el texto pegado o la subpartida no los especifica.</em></p></div>`;
            }

            if (report.tariff && !report.tariff.error) {
                const opt = report.tariff.analisisOptimizacion;
                taxContent += `<div class="savings-highlight">
                                    TLC / Régimen Sugerido: ${opt.regimenSugerido || 'NMF'}<br>
                                    <span style="font-size: 1.2rem; display:block; margin-top:5px;">Ahorro Potencial: ${opt.comparativaArancelaria?.ahorroPotencial || 'N/A'}</span>
                               </div>`;
            }
            reportAccordion.appendChild(createAccordionItem('4. Liquidación y Optimización', taxContent));

            // 5. Merx Academy Dinámica (Mini-clase)
            if (classificationResult.explicacionPedagogica) {
                dynamicAcademy.classList.remove('hidden');
                const activeLevelBtn = document.querySelector('.level-btn.active');
                const level = activeLevelBtn ? activeLevelBtn.getAttribute('data-level') : 'tecnico';
                const pedagogicalText = classificationResult.explicacionPedagogica[level] || classificationResult.explicacionPedagogica.tecnico;
                dynamicLessonContent.innerHTML = `<p>${pedagogicalText}</p>`;
            } else {
                dynamicAcademy.classList.add('hidden');
            }

        } catch (error) {
            console.error('Error en generateReport:', error);
            showError(`Ocurrió un error inesperado: ${error.message}`);
        } finally {
            logo.classList.remove('loading-animation');
        }
    }

    function showClarificationPrompt(classifData) {
        let reason = classifData.analisisMerciologico?.comentariosDuda || "Requerimos más detalles técnicos para confirmar la clasificación exacta entre las opciones.";
        clarificationReason.innerText = reason;

        let questionsHTML = '';

        if (classifData.preguntasSeleccion && classifData.preguntasSeleccion.length > 0) {
            classifData.preguntasSeleccion.forEach((q, qIndex) => {
                questionsHTML += `<div style="margin-bottom: 15px;">
                    <strong class="question-label" style="display:block; margin-bottom: 8px; color: #fff;">${q.pregunta}</strong>
                    <div style="display:flex; flex-direction: column; gap: 8px;" class="question-group">
                        ${q.opciones.map((op, oIndex) => `
                            <label style="cursor: pointer; color: #ddd; display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.2); padding: 5px 10px; border-radius: 5px;">
                                <input type="radio" name="clarif_q_${qIndex}" value="${op}" required> ${op}
                            </label>
                        `).join('')}
                        <label style="cursor: pointer; color: #ddd; display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.2); padding: 5px 10px; border-radius: 5px;">
                            <input type="radio" name="clarif_q_${qIndex}" value="Otro" class="other-radio" required> Otro:
                            <input type="text" class="other-text-input neumorphic-input" style="flex: 1; padding: 4px 8px; border-radius: 4px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white;" placeholder="Especificar..." disabled>
                        </label>
                    </div>
                </div>`;
            });
        }

        if (classifData.preguntaAbierta) {
            questionsHTML += `<div style="margin-bottom: 15px;">
                <strong class="question-label" style="display:block; margin-bottom: 8px; color: #fff;">${classifData.preguntaAbierta}</strong>
                <textarea class="neumorphic-textarea" style="height: 100px;" placeholder="Ingresa la información solicitada aquí..." required></textarea>
            </div>`;
        }

        clarificationQuestions.innerHTML = questionsHTML;
        updateUI(1.5);

        // Añadir lógica para habilitar/deshabilitar el campo de texto "Otro"
        const questionGroups = clarificationQuestions.querySelectorAll('.question-group');
        questionGroups.forEach(group => {
            const radios = group.querySelectorAll('input[type="radio"]');
            const otherTextInput = group.querySelector('.other-text-input');

            radios.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    if (e.target.value === 'Otro') {
                        otherTextInput.disabled = false;
                        otherTextInput.focus();
                        otherTextInput.required = true;
                    } else {
                        otherTextInput.disabled = true;
                        otherTextInput.value = '';
                        otherTextInput.required = false;
                    }
                });
            });
        });
    }

    function toggleAcademy(show) {
        if (show) {
            merxAcademy.classList.remove('hidden');

            // Explicitly hide elements instead of the parent container
            step1Container.classList.add('hidden');
            step3Container.classList.add('hidden');
            resultCard.classList.add('hidden');
            clarificationContainer.classList.add('hidden');

            repasoBtn.classList.add('hidden');
            leftButton.classList.add('hidden');
            rightButton.classList.add('hidden');
            skipButton.classList.add('hidden');

            initGame();
        } else {
            merxAcademy.classList.add('hidden');
            // Restore visibility based on the current state
            updateUI(currentState);
        }
    }

    function updateUI(state) {
        currentState = state;
        if (state === 0) {
            mainContainer.classList.remove('hidden');
            reportView.classList.add('hidden');
            step1Container.classList.remove('hidden');
            step3Container.classList.add('hidden');
            clarificationContainer.classList.add('hidden');
            resultCard.classList.add('hidden');
            skipButton.classList.add('hidden');

            leftButton.classList.remove('hidden');
            rightButton.classList.remove('hidden');
            repasoBtn.classList.remove('hidden');

            mainTextarea.value = '';
            animateTextChange(leftButtonContent, trashIcon);
            animateTextChange(rightButtonContent, "Buscar Ubicación");
            merxAcademy.classList.add('hidden'); // Oculta Academy por defecto en 0
        } else if (state === 1) {
            mainContainer.classList.remove('hidden');
            reportView.classList.add('hidden');
            step1Container.classList.add('hidden');
            resultCard.classList.remove('hidden');
            step3Container.classList.remove('hidden');
            clarificationContainer.classList.add('hidden');
            skipButton.classList.add('hidden');
            repasoBtn.classList.add('hidden');

            leftButton.classList.remove('hidden');
            rightButton.classList.remove('hidden');

            notesTextarea.value = '';
            animateTextChange(leftButtonContent, backIcon);
            animateTextChange(rightButtonContent, "Generar Informe");
            merxAcademy.classList.add('hidden');
        } else if (state === 1.5) {
            mainContainer.classList.remove('hidden');
            reportView.classList.add('hidden');
            step1Container.classList.add('hidden');
            resultCard.classList.remove('hidden');
            step3Container.classList.remove('hidden');
            clarificationContainer.classList.remove('hidden');
            skipButton.classList.remove('hidden');
            repasoBtn.classList.add('hidden');

            leftButton.classList.remove('hidden');
            rightButton.classList.remove('hidden');

            animateTextChange(leftButtonContent, backIcon);
            animateTextChange(rightButtonContent, "Responder y Clasificar");
        } else if (state === 2) {
            mainContainer.classList.add('hidden');
            reportView.classList.remove('hidden');
            reportView.classList.add('fade-in');
        }
    }

    rightButton.addEventListener('click', () => {
        if (currentState === 0) {
            findSacLocation();
        } else if (currentState === 1) {
            if (!notesTextarea.value.trim()) { alert("Por favor pega subpartidas arancelarias"); return; }
            generateReport(false);
        } else if (currentState === 1.5) {
            const unfilledOthers = Array.from(clarificationQuestions.querySelectorAll('.other-text-input[required]')).filter(input => !input.value.trim());
            if (unfilledOthers.length > 0) {
                alert("Por favor, especifica el detalle en la opción 'Otro'.");
                unfilledOthers[0].focus();
                return;
            }
            generateReport(false);
        }
    });

    skipButton.addEventListener('click', () => {
        if (currentState === 1.5) {
            generateReport(true);
        }
    });

    leftButton.addEventListener('click', () => {
        if (currentState === 0) {
            mainTextarea.value = '';
        } else if (currentState === 1 || currentState === 1.5) {
            updateUI(0);
        }
    });

    if (repasoBtn) repasoBtn.addEventListener('click', () => toggleAcademy(true));
    if (closeAcademyBtn) closeAcademyBtn.addEventListener('click', () => toggleAcademy(false));

    // --- Merx Academy Logic ---

    function initAcademy() {
        levelBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                levelBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const level = btn.getAttribute('data-level');
                academyDescription.innerText = academyData[level];
            });
        });
        initGame();
    }

    function initGame() {
        blocksPool.innerHTML = '';
        blocksResult.innerHTML = '';
        gameOrder = [];

        const shuffled = [...structureLevels].sort(() => Math.random() - 0.5);
        shuffled.forEach(lvl => {
            const el = document.createElement('div');
            el.className = 'hierarchy-block';
            el.innerText = lvl.name;
            el.dataset.id = lvl.id;
            el.addEventListener('click', () => handleBlockClick(lvl, el));
            blocksPool.appendChild(el);
        });
    }

    function handleBlockClick(lvl, el) {
        if (el.classList.contains('placed')) return;

        const nextOrder = gameOrder.length + 1;
        if (lvl.order === nextOrder) {
            el.classList.add('placed');
            gameOrder.push(lvl.id);

            const resEl = document.createElement('div');
            resEl.className = 'block-item placed';
            resEl.innerText = `${nextOrder}. ${lvl.name}`;
            blocksResult.appendChild(resEl);

            if (gameOrder.length === structureLevels.length) {
                setTimeout(() => alert("¡Excelente! Has dominado la jerarquía arancelaria."), 300);
            }
        } else {
            el.classList.add('shake');
            setTimeout(() => el.classList.remove('shake'), 400);
        }
    }

    function createAccordionItem(title, content) {
        const item = document.createElement('div');
        item.className = 'accordion-item';

        const header = document.createElement('div');
        header.className = 'accordion-header';
        header.innerText = title;

        const body = document.createElement('div');
        body.className = 'accordion-content';
        body.innerHTML = content;

        header.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            document.querySelectorAll('.accordion-item').forEach(i => i.classList.remove('active'));
            if (!isActive) item.classList.add('active');
        });

        item.appendChild(header);
        item.appendChild(body);
        return item;
    }

    function parseSacTaxes(text) {
        const lines = text.split('\n');
        let results = [];
        lines.forEach(line => {
            const match = line.match(/(\d+|II|E)\s+(\d+|II|E)\s+(\d+|II|E)\s*$/);
            if (match) {
                results.push({ dai: match[1], isc: match[2], iva: match[3] });
            }
        });
        return results[0] || null;
    }

    if (resetGameBtn) resetGameBtn.addEventListener('click', initGame);

    if (pasteButton) {
        pasteButton.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    mainTextarea.value = text;
                    mainTextarea.focus();
                }
            } catch (err) {
                console.error('Error al pegar:', err);
            }
        });
    }

    if (resetButton) {
        resetButton.addEventListener('click', () => {
            reportView.classList.add('fade-out');
            reportView.addEventListener('animationend', () => {
                reportView.classList.add('hidden');
                reportView.classList.remove('fade-out');
                updateUI(0);
            }, { once: true });
        });
    }

    const policyBtn = document.getElementById('policy-btn');
    const privacyBtn = document.getElementById('privacy-btn');
    const policyContent = document.getElementById('policy-content');
    const privacyContent = document.getElementById('privacy-content');

    if (policyBtn && privacyBtn) {
        policyBtn.addEventListener('click', () => {
            const isHidden = policyContent.classList.contains('hidden');
            policyContent.classList.add('hidden');
            privacyContent.classList.add('hidden');
            policyBtn.classList.remove('active');
            privacyBtn.classList.remove('active');
            if (isHidden) {
                policyContent.classList.remove('hidden');
                policyBtn.classList.add('active');
            }
        });

        privacyBtn.addEventListener('click', () => {
            const isHidden = privacyContent.classList.contains('hidden');
            policyContent.classList.add('hidden');
            privacyContent.classList.add('hidden');
            policyBtn.classList.remove('active');
            privacyBtn.classList.remove('active');
            if (isHidden) {
                privacyContent.classList.remove('hidden');
                privacyBtn.classList.add('active');
            }
        });
    }

    initAcademy();
    updateUI(0);
});

document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos del DOM ---
    const infoText = document.getElementById('info-text');
    const mainTextarea = document.getElementById('main-textarea');
    const textareaContainer = document.querySelector('.textarea-container'); // Contenedor del textarea
    const resultCard = document.getElementById('result-card');
    const leftButton = document.getElementById('left-button');
    const rightButton = document.getElementById('right-button');
    const mainContainer = document.getElementById('main-container');
    const reportView = document.getElementById('report-view');
    const resetButton = document.getElementById('reset-button');
    const pasteButton = document.getElementById('paste-button');

    const leftButtonContent = leftButton.querySelector('span');
    const rightButtonContent = rightButton.querySelector('span');
    const pasteButtonContent = pasteButton.querySelector('span');

    // --- Iconos SVG ---
    const trashIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;
    const backIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`;
    const clipboardIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clipboard-paste"><path d="M10 2v4a2 2 0 0 1-2 2H4"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8"/><rect width="8" height="4" x="8" y="2" rx="1"/></svg>`;
    pasteButtonContent.innerHTML = clipboardIcon;

    // --- Estado de la App ---
    let currentState = -1;
    let subState = 0;
    let sessionData = { description: '', location: '' };

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

        const logo = document.getElementById('logo');
        logo.classList.add('loading-animation');
        
        transitionElements(textareaContainer, resultCard); // FIX: Ocultar el contenedor del textarea
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
                uiText = `Sección: ${section}\n${chapterText}${rationale ? '\n\nMotivo: ' + rationale : ''}`;
            } else if (data.raw_text) {
                uiText = data.raw_text;
            } else {
                uiText = 'No se encontró clasificación confiable.';
            }

            resultCard.innerText = uiText;
            sessionData.location = uiText;
            animateTextChange(rightButtonContent, "Siguiente");
            subState = 1;

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

    async function generateReport() {
        const notes = mainTextarea.value;
        const logo = document.getElementById('logo');

        mainContainer.classList.add('fade-out');
        mainContainer.addEventListener('animationend', () => {
            mainContainer.classList.add('hidden');
            mainContainer.classList.remove('fade-out');
            
            const reportHeader = reportView.querySelector('.report-header');
            if (reportHeader) {
                // FIX: Crear el logo directamente para evitar problemas de clonación
                
            }

            reportView.classList.remove('hidden');
            const reportWrapper = document.getElementById('report-content-wrapper');
            reportWrapper.innerHTML = `<div class="loader"><div class="dot1"></div><div class="dot2"></div><div class="dot3"></div></div>`;
            reportView.classList.add('fade-in');
            logo.classList.add('loading-animation');
        }, { once: true });

        try {
            const payload = { 
                description: sessionData.description, 
                notes: notes,
                origen: 'No especificado', 
                perfilImportador: 'General' 
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
            const reportWrapper = document.getElementById('report-content-wrapper');
            reportWrapper.innerHTML = '';

            const createCard = (title, content) => {
                if (!content) return;
                const card = document.createElement('div');
                card.className = 'report-section-card';
                card.innerHTML = `<h3>${title}</h3><div class="card-content">${content}</div>`;
                reportWrapper.appendChild(card);
            };

            if (report.classification?.clasificacionPropuesta) {
                const {codigo, descripcion} = report.classification.clasificacionPropuesta;
                const { scoreFiabilidad, argumentoMerciologico } = report.classification;
                const content = 
                    `<p><strong>Código Propuesto:</strong> ${codigo || 'N/A'}</p>` +
                    `<p><strong>Descripción:</strong> ${descripcion || 'N/A'}</p>` +
                    `<p><strong>Fiabilidad:</strong> ${scoreFiabilidad ? Math.round(scoreFiabilidad * 100) + '%' : 'N/A'}</p>` +
                    `<p><strong>Argumento Merciológico:</strong><br>${argumentoMerciologico?.replace(/\n/g, '<br>') || 'N/A'}</p>`;
                createCard('1. Análisis de Clasificación Arancelaria', content);
            }

            if (report.legal && !report.legal.error) {
                const { applied_rules, notes_applied, jurisprudencia } = report.legal.fundamentoLegal;
                let content = '';
                if (applied_rules?.length > 0) content += '<h4>Reglas Generales Aplicadas:</h4><ul>' + applied_rules.map(r => `<li><strong>${r.rule_id}:</strong> ${r.descripcion}</li>`).join('') + '</ul>';
                if (notes_applied?.length > 0) content += '<h4>Notas de Sección/Capítulo:</h4><ul>' + notes_applied.map(n => `<li><strong>${n.note_id} (${n.tipo || 'N/A'}):</strong> ${n.descripcion}</li>`).join('') + '</ul>';
                if (jurisprudencia?.length > 0) content += '<h4>Jurisprudencia Relevante (TATA):</h4><ul>' + jurisprudencia.map(j => `<li><strong>${j.case_id}:</strong> ${j.summary}</li>`).join('') + '</ul>';
                createCard('2. Fundamento Legal y Jurisprudencia', content);
            }

            if (report.regulatory && !report.regulatory.error) {
                const { institucionPrincipal, requisitos } = report.regulatory.analisisRegulatorio;
                if (requisitos?.length > 0) {
                    let content = `<p><strong>Institución Principal Sugerida:</strong> ${institucionPrincipal || 'N/A'}</p><h4>Requisitos y Permisos:</h4><ul>` + requisitos.map(r => `<li><strong>${r.nombre} (${r.institucion}):</strong> ${r.detalle}</li>`).join('') + '</ul>';
                    createCard('3. Análisis Regulatorio (Permisos y Barreras)', content);
                }
            }

            if (report.risk && !report.risk.error) {
                const { analisisRiesgoMercancia } = report.risk;
                if (analisisRiesgoMercancia?.length > 0) {
                    let content = analisisRiesgoMercancia.map(r => `<p><strong>${r.riesgoIdentificado}:</strong> ${r.justificacion}<br><em>Recomendación: ${r.recomendacion}</em></p>`).join('');
                    createCard('4. Análisis de Riesgo Inherente a la Mercancía', content);
                }
            }

            if (report.tariff && !report.tariff.error) {
                const { regimenSugerido, cumpleOrigenPotencial, justificacionOrigen, comparativaArancelaria, recomendacionEstrategica } = report.tariff.analisisOptimizacion;
                if (regimenSugerido) {
                    let content = 
                        `<p><strong>Régimen Sugerido:</strong> ${regimenSugerido}</p>` +
                        `<p><strong>Cumple Origen Potencial:</strong> ${cumpleOrigenPotencial}</p>` +
                        `<p><em>Justificación:</em> ${justificacionOrigen}</p>` +
                        `<h4>Comparativa:</h4>` +
                        `<ul><li>Arancel Normal (NMF): ${comparativaArancelaria.arancelNMF}</li><li>Arancel Preferencial: ${comparativaArancelaria.arancelPreferencial}</li></ul>` +
                        `<p><strong>Ahorro Potencial:</strong> ${comparativaArancelaria.ahorroPotencial}</p>` +
                        `<p><strong>Recomendación Estratégica:</strong> ${recomendacionEstrategica}</p>`;
                    createCard('5. Análisis de Optimización Arancelaria', content);
                }
            }

        } catch (error) {
            console.error('Error en generateReport:', error);
            showError(`Ocurrió un error inesperado: ${error.message}`);
        } finally {
            logo.classList.remove('loading-animation');
        }
    }

    function updateUI(state) {
        currentState = state;
        if (state === 0) {
            subState = 0;
            mainContainer.classList.remove('hidden');
            reportView.classList.add('hidden');
            infoText.classList.add('hidden');
            textareaContainer.classList.remove('hidden'); // FIX: Mostrar contenedor
            mainTextarea.classList.remove('tall');
            mainTextarea.placeholder = "Describe tu mercancía aquí";
            mainTextarea.value = "";
            resultCard.classList.add('hidden');
            animateTextChange(leftButtonContent, trashIcon);
            animateTextChange(rightButtonContent, "Buscar Ubicacion");
        } else if (state === 1) {
            mainContainer.classList.remove('hidden');
            reportView.classList.add('hidden');
            infoText.classList.remove('hidden');
            textareaContainer.classList.remove('hidden'); // FIX: Mostrar contenedor
            mainTextarea.classList.add('tall');
            mainTextarea.value = '';
            mainTextarea.placeholder = "Añade notas para el informe...";
            resultCard.classList.add('hidden');
            animateTextChange(leftButtonContent, backIcon);
            animateTextChange(rightButtonContent, "Generar informe");
        }
    }

    rightButton.addEventListener('click', () => {
        if (currentState === 0) {
            if (subState === 0) findSacLocation();
            else updateUI(1);
        } else if (currentState === 1) {
            generateReport();
        }
    });

    leftButton.addEventListener('click', () => {
        if (currentState === 0) {
            if (subState === 0) mainTextarea.value = '';
            else {
                transitionElements(resultCard, textareaContainer); // FIX: Usar el contenedor
                animateTextChange(rightButtonContent, "Buscar Ubicacion");
                subState = 0;
            }
        } else if (currentState === 1) {
            updateUI(0);
        }
    });

    resetButton.addEventListener('click', () => {
        reportView.classList.add('fade-out');
        reportView.addEventListener('animationend', () => {
            reportView.classList.add('hidden');
            reportView.classList.remove('fade-out');
            updateUI(0);
        }, { once: true });
    });

    pasteButton.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                mainTextarea.value = text;
                mainTextarea.focus();
            }
        } catch (err) {
            console.error('Error al pegar desde el portapapeles:', err);
        }
    });

    updateUI(0);

    // --- Policy Section Logic ---
    const policyBtn = document.getElementById('policy-btn');
    const privacyBtn = document.getElementById('privacy-btn');
    const policyContent = document.getElementById('policy-content');
    const privacyContent = document.getElementById('privacy-content');

    if (policyBtn) { // Check if buttons exist to avoid errors in other views
        policyBtn.addEventListener('click', () => {
            const isHidden = policyContent.classList.contains('hidden');
            
            // Hide both first
            policyContent.classList.add('hidden');
            privacyContent.classList.add('hidden');
            policyBtn.classList.remove('active');
            privacyBtn.classList.remove('active');

            // If it was hidden, show it
            if (isHidden) {
                policyContent.classList.remove('hidden');
                policyBtn.classList.add('active');
            }
        });

        privacyBtn.addEventListener('click', () => {
            const isHidden = privacyContent.classList.contains('hidden');

            // Hide both first
            policyContent.classList.add('hidden');
            privacyContent.classList.add('hidden');
            policyBtn.classList.remove('active');
            privacyBtn.classList.remove('active');

            // If it was hidden, show it
            if (isHidden) {
                privacyContent.classList.remove('hidden');
                privacyBtn.classList.add('active');
            }
        });
    }
});
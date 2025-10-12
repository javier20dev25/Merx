document.addEventListener('DOMContentLoaded', () => {
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
    let subState = 0;
    let sessionData = { description: '', location: '' };

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
        hideEl.classList.add('fade-out');
        hideEl.addEventListener('animationend', () => {
            hideEl.classList.add('hidden');
            hideEl.classList.remove('fade-out');
            showEl.classList.remove('hidden');
            showEl.classList.add('fade-in');
        }, { once: true });
    }

    async function findSacLocation() {
        sessionData.description = mainTextarea.value;
        if (!sessionData.description.trim()) return;

        transitionElements(mainTextarea, resultContainer);
        resultContainer.innerHTML = `<div class="loader"><div class="dot1"></div><div class="dot2"></div><div class="dot3"></div></div>`;
        rightButton.disabled = true;

        try {
            const response = await fetch('/api/find-sac-chapter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: sessionData.description }) });
            if (!response.ok) throw new Error(`Error del servidor: ${response.statusText}`);
            const data = await response.json();
            sessionData.location = data.location || 'No se encontró ubicación.';
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

    function showError(message) {
        const reportWrapper = document.getElementById('report-content-wrapper');
        reportWrapper.innerHTML = `<p class="report-final-text" style="color: #c0392b;">${message}</p>`;
    }

    async function generateReport() {
        const notes = mainTextarea.value;

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
            const payload = { description: sessionData.description, location: sessionData.location, notes: notes };
            const resp = await fetch('/api/generate-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const raw = await resp.text();
            console.log('RAW /api/generate-report response:', raw.slice(0, 5000));

            let data;
            try {
                data = JSON.parse(raw);
            } catch (err) {
                console.error('Respuesta no-JSON del servidor:', err);
                showError('El servidor devolvió una respuesta no JSON. Mira la consola para más detalles.');
                return;
            }

            const reportData = (data && data.report) ? data.report : data;

            if (!reportData || !reportData.clasificacionPropuesta || !reportData.clasificacionPropuesta.codigo) {
                console.error('Informe inválido del backend:', data);
                showError('El informe está incompleto. Revisa la consola (Network → response) para ver la respuesta completa.');
                return;
            }

            const reportWrapper = document.getElementById('report-content-wrapper');
            reportWrapper.innerHTML = '';
            let reportHtml = '';
            const renderSection = (title, content) => {
                if (content) {
                    reportHtml += `<div class="report-section-title">${title}</div>`;
                    reportHtml += `<div class="report-section-content">${content.replace(/\n/g, '<br>')}</div>`;
                }
            };

            if (reportData.clasificacionPropuesta && reportData.clasificacionPropuesta.codigo) {
                reportHtml += `<div class="report-section-title">Clasificación Arancelaria Propuesta:</div>`;
                reportHtml += `<div class="report-section-content">Código: <strong>${reportData.clasificacionPropuesta.codigo}</strong><br>Descripción: ${reportData.clasificacionPropuesta.descripcion}<br>Unidad: ${reportData.clasificacionPropuesta.unidad}<br>Arancel Estimado: ${reportData.clasificacionPropuesta.arancel_estimado}</div>`;
            }

            if (reportData.scoreFiabilidad) {
                let scoreClass = 'score-red';
                if (reportData.scoreFiabilidad >= 8) scoreClass = 'score-green';
                else if (reportData.scoreFiabilidad >= 5) scoreClass = 'score-yellow';
                reportHtml += `<div class="report-section-title">Score de Fiabilidad:</div>`;
                reportHtml += `<div class="score-display ${scoreClass}">${reportData.scoreFiabilidad}/10</div>`;
            }

            renderSection('Argumento Merciológico:', reportData.argumentoMerciologico);

            if (reportData.fundamentoLegal) {
                reportHtml += `<div class="report-section-title">Fundamento Legal:</div>`;
                if (reportData.fundamentoLegal.applied_rules && reportData.fundamentoLegal.applied_rules.length > 0) {
                    reportHtml += `<div class="report-section-content"><strong>Reglas Aplicadas:</strong><ul>`;
                    reportData.fundamentoLegal.applied_rules.forEach(rule => { reportHtml += `<li>${rule.rule_id}: ${rule.descripcion || 'N/A'}</li>`; });
                    reportHtml += `</ul></div>`;
                }
                if (reportData.fundamentoLegal.notes_applied && reportData.fundamentoLegal.notes_applied.length > 0) {
                    reportHtml += `<div class="report-section-content"><strong>Notas Aplicadas:</strong><ul>`;
                    reportData.fundamentoLegal.notes_applied.forEach(note => { reportHtml += `<li>${note.note_id}: ${note.descripcion || 'N/A'}</li>`; });
                    reportHtml += `</ul></div>`;
                }
            }

            renderSection('Conclusión:', reportData.conclusion);

            reportWrapper.innerHTML = reportHtml;

        } catch (error) {
            console.error('Error en generateReport:', error);
            showError('Ocurrió un error inesperado al generar el informe.');
        }
    }

    function updateUI(state) {
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
            animateTextChange(leftButtonContent, trashIcon);
            animateTextChange(rightButtonContent, "Buscar Ubicacion");
        } else if (state === 1) {
            mainContainer.classList.remove('hidden');
            reportView.classList.add('hidden');
            infoText.classList.remove('hidden');
            mainTextarea.classList.add('tall');
            mainTextarea.value = '';
            mainTextarea.placeholder = "Añade notas para el informe...";
            resultContainer.classList.add('hidden');
            mainTextarea.classList.remove('hidden');
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
                transitionElements(resultContainer, mainTextarea);
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

    updateUI(0);
});

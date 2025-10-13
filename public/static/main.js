document.addEventListener('DOMContentLoaded', () => {
    const infoText = document.getElementById('info-text');
    const mainTextarea = document.getElementById('main-textarea');
    const resultCard = document.getElementById('result-card'); // FIX: Correct ID
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
        if (!hideEl || !showEl) return; // Safety check
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

        const logo = document.getElementById('logo');
        logo.classList.add('loading-animation');
        
        transitionElements(mainTextarea, resultCard);
        resultCard.innerHTML = ''; // Limpiar contenedor
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
            reportView.classList.remove('hidden');
            const reportWrapper = document.getElementById('report-content-wrapper');
            reportWrapper.innerHTML = `<div class="loader"><div class="dot1"></div><div class="dot2"></div><div class="dot3"></div></div>`;
            reportView.classList.add('fade-in');
            logo.classList.add('loading-animation');
        }, { once: true });

        try {
            const payload = { description: sessionData.description, location: sessionData.location, notes: notes };
            const resp = await fetch('/api/generate-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            
            if (!resp.ok) {
                throw new Error(`Error del servidor: ${resp.statusText}`);
            }

            const data = await resp.json();

            if (!data || !data.ui_text) {
                console.error('Respuesta inválida del backend:', data);
                showError('El servidor no devolvió un texto de UI válido.');
                return;
            }

            const reportWrapper = document.getElementById('report-content-wrapper');
            reportWrapper.innerHTML = `<p class="report-final-text">${data.ui_text.replace(/ — /g, '<br><br>')}</p>`;

        } catch (error) {
            console.error('Error en generateReport:', error);
            showError('Ocurrió un error inesperado al generar el informe.');
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
            mainTextarea.classList.remove('tall');
            mainTextarea.placeholder = "Describe tu mercancía aquí";
            mainTextarea.value = "";
            resultCard.classList.add('hidden'); // FIX: Correct variable
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
            resultCard.classList.add('hidden'); // FIX: Correct variable
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
                transitionElements(resultCard, mainTextarea); // FIX: Correct variable
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
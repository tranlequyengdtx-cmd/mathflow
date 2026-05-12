// App State
let questions = []; // Will be loaded from questions.json
let currentState = {
    screen: 'login',
    studentName: '',
    studentClass: '',
    currentQuestionIndex: 0,
    answers: Array(questions.length).fill(null),
    startTime: null,
    timerInterval: null
};

// DOM Elements
const screens = {
    login: document.getElementById('login-screen'),
    quiz: document.getElementById('quiz-screen'),
    result: document.getElementById('result-screen')
};

const elements = {
    studentName: document.getElementById('student-name'),
    studentClass: document.getElementById('student-class'),
    startBtn: document.getElementById('start-btn'),
    questionContainer: document.getElementById('question-container'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    submitBtn: document.getElementById('submit-btn'),
    progressBar: document.getElementById('progress-bar'),
    questionNumber: document.getElementById('question-number'),
    timer: document.getElementById('timer'),
    finalScore: document.getElementById('final-score'),
    studentSummary: document.getElementById('student-summary'),
    saveFeedbackBtn: document.getElementById('save-feedback-btn'),
    studentFeedback: document.getElementById('student-feedback')
};

// Initialize Icons
lucide.createIcons();

// --- Core Functions ---

async function loadQuestions() {
    try {
        const response = await fetch('questions.json');
        questions = await response.json();
        if (questions.length === 0) {
            alert('Không tìm thấy câu hỏi nào!');
        }
    } catch (e) {
        console.error('Lỗi khi tải câu hỏi:', e);
    }
}

function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
    currentState.screen = screenName;
    lucide.createIcons();
}

async function startQuiz() {
    const name = elements.studentName.value.trim();
    const classInfo = elements.studentClass.value.trim();

    if (!name || !classInfo) {
        alert('Vui lòng nhập đầy đủ thông tin!');
        return;
    }

    await loadQuestions();
    
    if (questions.length === 0) {
        // Sample fallback if no questions exported
        questions = [
            { id: "demo", content: "Chưa có câu hỏi nào được xuất từ Vault. Vui lòng chạy kịch bản kết nối.", type: "mcq", options: ["Đã hiểu"], answer: 0 }
        ];
    }

    currentState.studentName = name;
    currentState.studentClass = classInfo;
    currentState.startTime = new Date();
    
    showScreen('quiz');
    renderQuestion();
    startTimer();
}

function startTimer() {
    const startTime = Date.now();
    currentState.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        elements.timer.textContent = `${mins}:${secs}`;
    }, 1000);
}

function renderQuestion() {
    const index = currentState.currentQuestionIndex;
    const q = questions[index];
    
    // Update Progress
    const progress = ((index + 1) / questions.length) * 100;
    elements.progressBar.style.width = `${progress}%`;
    elements.questionNumber.textContent = `Câu ${index + 1}/${questions.length}`;

    // Generate HTML
    let html = `
        <div class="question-card">
            <div class="question-text">${q.content}</div>
            <div class="options-list">
                ${q.options.map((opt, i) => `
                    <div class="option-item ${currentState.answers[index] === i ? 'selected' : ''}" data-index="${i}">
                        <div class="option-radio"></div>
                        <div class="option-content">${opt}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    elements.questionContainer.innerHTML = html;

    // Render LaTeX
    renderMathInElement(elements.questionContainer, {
        delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false}
        ],
        throwOnError: false
    });

    // Add Event Listeners to options
    document.querySelectorAll('.option-item').forEach(item => {
        item.addEventListener('click', () => {
            // If already answered, don't allow changing for instant feedback mode
            if (currentState.answers[index] !== null) return;

            const optIndex = parseInt(item.dataset.index);
            const isCorrect = optIndex === q.answer;
            
            currentState.answers[index] = optIndex;
            
            // Apply visual feedback
            item.classList.add(isCorrect ? 'correct' : 'incorrect');
            
            if (!isCorrect) {
                // Highlight the correct answer
                const correctItem = document.querySelector(`.option-item[data-index="${q.answer}"]`);
                if (correctItem) correctItem.classList.add('correct-hint');
            }

            // Small delay before allowing next question or just leave it for review
            setTimeout(() => {
                // Optional: auto-advance or just let them click 'Next'
            }, 1000);
        });
    });

    // Update Navigation Buttons
    elements.prevBtn.disabled = index === 0;
    if (index === questions.length - 1) {
        elements.nextBtn.classList.add('hidden');
        elements.submitBtn.classList.remove('hidden');
    } else {
        elements.nextBtn.classList.remove('hidden');
        elements.submitBtn.classList.add('hidden');
    }
}

function nextQuestion() {
    if (currentState.currentQuestionIndex < questions.length - 1) {
        currentState.currentQuestionIndex++;
        renderQuestion();
    }
}

function prevQuestion() {
    if (currentState.currentQuestionIndex > 0) {
        currentState.currentQuestionIndex--;
        renderQuestion();
    }
}

function submitQuiz() {
    clearInterval(currentState.timerInterval);
    
    // Calculate Score
    let score = 0;
    currentState.answers.forEach((ans, i) => {
        if (ans === questions[i].answer) score++;
    });

    // Show Results
    elements.finalScore.textContent = `${score}/${questions.length}`;
    elements.studentSummary.textContent = `${currentState.studentName} - Lớp ${currentState.studentClass}`;
    
    showScreen('result');
}

function saveFeedback() {
    const feedback = elements.studentFeedback.value;
    alert(`Cảm ơn ${currentState.studentName}! Phản hồi của bạn đã được ghi nhận: "${feedback}"`);
    // In a real app, you'd send this to a backend (Python/CSV)
}

// --- Event Listeners ---
elements.startBtn.addEventListener('click', startQuiz);
elements.nextBtn.addEventListener('click', nextQuestion);
elements.prevBtn.addEventListener('click', prevQuestion);
elements.submitBtn.addEventListener('click', submitQuiz);
elements.saveFeedbackBtn.addEventListener('click', saveFeedback);

// Enter to start
elements.studentClass.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startQuiz();
});

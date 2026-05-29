// App State
let questions = []; // Will be loaded from questions.json
let currentState = {
    screen: 'login',
    studentName: '',
    studentClass: '',
    currentQuestionIndex: 0,
    answers: [], // Array of originalIndex answers
    startTime: null,
    timerInterval: null,
    totalTimeSeconds: 0,
    timeLimit: 0,
    cheatCount: 0,
    reviewMode: false,
    allowSolve: false
};

const MathFlowCrypto = {
    salt: "mathflow_secret_2026",
    
    async hashAnswer(index) {
        const text = `${index}_${this.salt}`;
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    xorDecrypt(base64String) {
        if (!base64String) return "";
        try {
            const binaryStr = atob(base64String);
            const xordStr = decodeURIComponent(escape(binaryStr));
            let decrypted = "";
            for (let i = 0; i < xordStr.length; i++) {
                const keyChar = this.salt.charCodeAt(i % this.salt.length);
                decrypted += String.fromCharCode(xordStr.charCodeAt(i) ^ keyChar);
            }
            return decrypted;
        } catch (e) {
            console.error("Lỗi giải mã:", e);
            return "Lỗi giải mã lời giải.";
        }
    }
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
    studentFeedback: document.getElementById('student-feedback'),
    finalTime: document.getElementById('final-time'),
    themeToggle: document.getElementById('theme-toggle'),
    themeIcon: document.getElementById('theme-icon'),
    reviewBtn: document.getElementById('review-btn'),
    exitReviewBtn: document.getElementById('exit-review-btn'),
    examTime: document.getElementById('exam-time')
};

// Safe wrappers for third-party libraries (handles offline mode or local file access)
function safeCreateIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        try {
            lucide.createIcons();
        } catch (e) {
            console.warn("Lucide icons failed to render:", e);
        }
    }
}

function safeRenderMath(element) {
    if (typeof renderMathInElement !== 'undefined') {
        try {
            renderMathInElement(element, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false }
                ],
                throwOnError: false
            });
        } catch (e) {
            console.warn("KaTeX failed to render:", e);
        }
    }
}

// Initialize Icons
safeCreateIcons();

// --- Core Functions ---

function parseQuestionsData(data) {
    if (Array.isArray(data)) {
        questions = data;
        currentState.allowSolve = false;
    } else {
        questions = data.questions || [];
        currentState.allowSolve = data.allowSolve !== undefined ? data.allowSolve : false;
        
        // Nếu file xuất cấu hình thời gian kiểm tra cố định, áp dụng và vô hiệu hóa thay đổi trên UI
        if (data.timeLimit !== undefined) {
            currentState.timeLimit = data.timeLimit;
            if (elements.examTime) {
                let optionExists = false;
                for (let i = 0; i < elements.examTime.options.length; i++) {
                    if (parseFloat(elements.examTime.options[i].value) === data.timeLimit) {
                        optionExists = true;
                        break;
                    }
                }
                if (!optionExists) {
                    const newOpt = document.createElement('option');
                    newOpt.value = data.timeLimit;
                    newOpt.textContent = data.timeLimit > 0 ? (data.timeLimit < 1 ? `${data.timeLimit * 60} Giây` : `${data.timeLimit} Phút`) : "Không giới hạn";
                    elements.examTime.appendChild(newOpt);
                }
                elements.examTime.value = data.timeLimit;
                elements.examTime.disabled = true; // Học sinh không được tự chọn
            }
        }
    }
}

async function loadQuestions() {
    // 1. Nạp từ biến toàn cục trước (Bypass CORS khi học sinh chạy trực tiếp file HTML offline!)
    if (window.mathflowData) {
        parseQuestionsData(window.mathflowData);
        return;
    }

    // 2. Fallback sang fetch questions.json
    try {
        const response = await fetch('questions.json');
        const data = await response.json();
        parseQuestionsData(data);
    } catch (e) {
        console.warn('Lỗi khi nạp file câu hỏi động (chạy offline hoặc không tìm thấy file):', e);
    }
    
    if (questions.length === 0) {
        alert('Không tìm thấy câu hỏi nào!');
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
    currentState.screen = screenName;
    safeCreateIcons();
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
    } else {
        // Shuffle Questions
        shuffleArray(questions);
        // Shuffle Options for each question
        questions.forEach(q => {
            if (q.options && q.options.length > 0 && typeof q.options[0] === 'string') {
                const optionsWithIndices = q.options.map((opt, i) => ({ text: opt, originalIndex: i }));
                shuffleArray(optionsWithIndices);
                q.options = optionsWithIndices;
            }
        });
    }

    currentState.studentName = name;
    currentState.studentClass = classInfo;
    currentState.startTime = new Date();
    currentState.reviewMode = false;
    currentState.timeLimit = parseFloat(elements.examTime.value) || 0;

    // Re-initialize answers array with the correct length
    currentState.answers = Array(questions.length).fill(null);
    currentState.currentQuestionIndex = 0;
    currentState.totalTimeSeconds = 0;
    currentState.cheatCount = 0;

    // Kích hoạt chế độ chống sao chép
    document.body.classList.add('no-select');

    showScreen('quiz');
    renderQuestion();
    startTimer();

    // Lưu trạng thái làm bài ban đầu
    saveStateToLocalStorage();
}

function startTimer() {
    const startTime = Date.now();
    
    // Reset timer styles
    elements.timer.style.color = "";
    elements.timer.style.fontWeight = "";
    elements.timer.classList.remove("pulse-warning");

    if (currentState.timeLimit === 0) {
        currentState.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            currentState.totalTimeSeconds = elapsed;
            const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const secs = (elapsed % 60).toString().padStart(2, '0');
            elements.timer.textContent = `${mins}:${secs}`;
        }, 1000);
    } else {
        const totalDurationSeconds = currentState.timeLimit * 60;
        currentState.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            currentState.totalTimeSeconds = elapsed;
            
            const remaining = totalDurationSeconds - elapsed;
            if (remaining <= 0) {
                clearInterval(currentState.timerInterval);
                elements.timer.textContent = "00:00";
                alert("Hết thời gian làm bài! Hệ thống sẽ tự động nộp bài.");
                submitQuiz();
                return;
            }
            
            const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
            const secs = (remaining % 60).toString().padStart(2, '0');
            elements.timer.textContent = `${mins}:${secs}`;
            
            if (remaining <= 60) {
                elements.timer.style.color = "var(--error)";
                elements.timer.style.fontWeight = "bold";
                elements.timer.classList.add("pulse-warning");
            }
        }, 1000);
    }
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
                ${q.options.map((optObj, i) => {
                    let statusClass = '';
                    if (currentState.reviewMode) {
                        if (optObj.originalIndex === q.correctOriginalIndex) statusClass = 'correct';
                        else if (currentState.answers[index] === optObj.originalIndex) statusClass = 'incorrect';
                    }

                    return `
                        <div class="option-item ${statusClass} ${currentState.answers[index] === optObj.originalIndex ? 'selected' : ''}" data-original-index="${optObj.originalIndex}">
                            <div class="option-radio"></div>
                            <div class="option-content">${optObj.text}</div>
                        </div>
                    `;
                }).join('')}
            </div>
            ${currentState.reviewMode && q.explanation ? `
                <div class="explanation-box">
                    <div class="explanation-title"><i data-lucide="info"></i> Giải thích chi tiết:</div>
                    <div class="explanation-content">${MathFlowCrypto.xorDecrypt(q.explanation)}</div>
                </div>
            ` : ''}
            ${currentState.reviewMode && !q.explanation ? `
                <div class="explanation-box">
                    <div class="explanation-title"><i data-lucide="check-circle"></i> Đáp án đúng là: ${q.options.find(o => o.originalIndex === q.correctOriginalIndex)?.text || ''}</div>
                </div>
            ` : ''}
        </div>
    `;

    elements.questionContainer.innerHTML = html;

    // Render LaTeX
    safeRenderMath(elements.questionContainer);

    // Add Event Listeners to options
    if (!currentState.reviewMode) {
        document.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', () => {
                const origIndex = parseInt(item.dataset.originalIndex);
                currentState.answers[index] = origIndex;

                // Cập nhật giao diện lựa chọn
                document.querySelectorAll('.option-item').forEach(opt => opt.classList.remove('selected'));
                item.classList.add('selected');
                
                // Lưu đáp án vào bộ nhớ tạm
                saveStateToLocalStorage();
            });
        });
    }

    // Update Navigation Buttons
    elements.prevBtn.disabled = index === 0;
    
    if (currentState.reviewMode) {
        elements.nextBtn.classList.toggle('hidden', index === questions.length - 1);
        elements.submitBtn.classList.add('hidden');
        elements.exitReviewBtn.classList.remove('hidden');
    } else {
        elements.exitReviewBtn.classList.add('hidden');
        if (index === questions.length - 1) {
            elements.nextBtn.classList.add('hidden');
            elements.submitBtn.classList.remove('hidden');
        } else {
            elements.nextBtn.classList.remove('hidden');
            elements.submitBtn.classList.add('hidden');
        }
    }
    safeCreateIcons();
}

function nextQuestion() {
    if (currentState.currentQuestionIndex < questions.length - 1) {
        currentState.currentQuestionIndex++;
        renderQuestion();
        saveStateToLocalStorage();
    }
}

function prevQuestion() {
    if (currentState.currentQuestionIndex > 0) {
        currentState.currentQuestionIndex--;
        renderQuestion();
        saveStateToLocalStorage();
    }
}

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyKfePtv4VUWkLkptih8B9DEJnvFV10QBrGQYIWpTdaFQNzsR6EbPtoqXJq1o5QDkd2/exec';

async function submitQuiz() {
    clearInterval(currentState.timerInterval);

    // Xóa bộ nhớ lưu nháp bài thi
    clearLocalStorageState();

    // Thoát chế độ toàn màn hình
    if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
        document.exitFullscreen().catch(err => console.error("Lỗi khi thoát toàn màn hình:", err));
    }

    // Tắt chế độ chống sao chép
    document.body.classList.remove('no-select');

    // Calculate Score
    let score = 0;
    for (let i = 0; i < currentState.answers.length; i++) {
        const ans = currentState.answers[i];
        if (ans !== null && ans !== undefined) {
            const hash = await MathFlowCrypto.hashAnswer(ans);
            if (hash === questions[i].answer) score++;
        }
    }

    const scoreText = `${score}/${questions.length}`;

    // Format Time
    const totalTime = currentState.totalTimeSeconds;
    const mins = Math.floor(totalTime / 60).toString().padStart(2, '0');
    const secs = (totalTime % 60).toString().padStart(2, '0');
    const timeText = `${mins}:${secs}`;

    // Format Cheating Info
    const cheatInfo = currentState.cheatCount > 0 ? `Có (${currentState.cheatCount} lần)` : "Không";

    // Show Results
    elements.finalScore.textContent = scoreText;
    if (elements.finalTime) {
        elements.finalTime.textContent = timeText;
    }
    elements.studentSummary.textContent = `${currentState.studentName} - Lớp ${currentState.studentClass}`;

    // Ẩn hoặc hiển thị nút Xem lại bài làm dựa trên allowSolve
    if (currentState.allowSolve) {
        elements.reviewBtn.classList.remove('hidden');
    } else {
        elements.reviewBtn.classList.add('hidden');
    }

    showScreen('result');

    // Automatically send basic results to Google Sheets
    sendDataToGoogle({
        studentName: currentState.studentName,
        studentClass: currentState.studentClass,
        score: scoreText,
        time: timeText,
        cheated: cheatInfo,
        feedback: "Nộp bài tự động"
    });
}

async function sendDataToGoogle(data) {
    try {
        console.log('Sending data to Google Sheets...', data);
        // Use no-cors mode for Google Apps Script if needed, 
        // but for a teacher's tool, a simple fetch usually works with proper Apps Script setup
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Important for Google Apps Script redirects
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        console.log('Data sent successfully');
    } catch (e) {
        console.error('Error sending data:', e);
    }
}

async function saveFeedback() {
    const feedback = elements.studentFeedback.value.trim();
    if (!feedback) return;

    elements.saveFeedbackBtn.disabled = true;
    elements.saveFeedbackBtn.textContent = "Đang gửi...";

    // Format Time & Cheat info to re-send if needed
    const totalTime = currentState.totalTimeSeconds;
    const mins = Math.floor(totalTime / 60).toString().padStart(2, '0');
    const secs = (totalTime % 60).toString().padStart(2, '0');
    const timeText = `${mins}:${secs}`;
    const cheatInfo = currentState.cheatCount > 0 ? `Có (${currentState.cheatCount} lần)` : "Không";

    await sendDataToGoogle({
        studentName: currentState.studentName,
        studentClass: currentState.studentClass,
        score: elements.finalScore.textContent,
        time: timeText,
        cheated: cheatInfo,
        feedback: feedback
    });

    alert(`Cảm ơn ${currentState.studentName}! Ý kiến của bạn đã được gửi tới giáo viên.`);
    elements.saveFeedbackBtn.textContent = "Đã gửi phản hồi";
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    elements.themeIcon.setAttribute('data-lucide', isLight ? 'moon' : 'sun');
    safeCreateIcons();
}

async function enterReviewMode() {
    // Bảo mật kép: Chặn truy cập nếu giáo viên đã khóa tính năng xem giải
    if (!currentState.allowSolve) {
        alert("Tính năng xem lại bài làm đã bị giáo viên khóa cho bài thi này.");
        return;
    }
    
    // Pre-calculate correct indices
    for (let q of questions) {
        if (q.options) {
            for (let i = 0; i < q.options.length; i++) {
                if (await MathFlowCrypto.hashAnswer(i) === q.answer) {
                    q.correctOriginalIndex = i;
                    break;
                }
            }
        }
    }
    
    currentState.reviewMode = true;
    currentState.currentQuestionIndex = 0;
    showScreen('quiz');
    renderQuestion();
}

function exitReview() {
    currentState.reviewMode = false;
    showScreen('result');
}

// --- Security & Fullscreen Helpers ---
async function enterFullscreen() {
    try {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
            await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
            await docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
            await docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
            await docEl.msRequestFullscreen();
        }
    } catch (err) {
        console.error("Lỗi khi vào chế độ toàn màn hình:", err);
    }
}

function setupSecurityRestrictions() {
    // Chặn chuột phải
    document.addEventListener('contextmenu', (e) => {
        if (currentState.screen === 'quiz' && !currentState.reviewMode) {
            e.preventDefault();
            alert("Tính năng chuột phải bị vô hiệu hóa trong phòng thi!");
        }
    });

    // Chặn phím tắt sao chép, cắt, dán, in, devtools
    document.addEventListener('keydown', (e) => {
        if (currentState.screen === 'quiz' && !currentState.reviewMode) {
            const ctrlOrMeta = e.ctrlKey || e.metaKey;
            
            if (ctrlOrMeta && ['c', 'x', 'v', 'u', 'p', 's'].includes(e.key.toLowerCase())) {
                e.preventDefault();
                alert("Hành động sao chép/in ấn/lưu trữ bị chặn để bảo mật đề thi!");
            }
            
            if (e.key === 'F12' || (ctrlOrMeta && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase()))) {
                e.preventDefault();
                alert("Vui lòng không mở Công cụ nhà phát triển trong phòng thi!");
            }
        }
    });
}

// --- LocalStorage State Management ---
function saveStateToLocalStorage() {
    if (currentState.screen === 'quiz' && !currentState.reviewMode) {
        const stateToSave = {
            questions: questions,
            currentState: {
                studentName: currentState.studentName,
                studentClass: currentState.studentClass,
                currentQuestionIndex: currentState.currentQuestionIndex,
                answers: currentState.answers,
                startTime: currentState.startTime ? currentState.startTime.getTime() : null,
                totalTimeSeconds: currentState.totalTimeSeconds,
                timeLimit: currentState.timeLimit,
                cheatCount: currentState.cheatCount,
                savedAt: Date.now()
            }
        };
        localStorage.setItem('mathflow_state', JSON.stringify(stateToSave));
    }
}

function clearLocalStorageState() {
    localStorage.removeItem('mathflow_state');
}

function restoreQuiz(data) {
    questions = data.questions;
    currentState.studentName = data.currentState.studentName;
    currentState.studentClass = data.currentState.studentClass;
    currentState.currentQuestionIndex = data.currentState.currentQuestionIndex;
    currentState.answers = data.currentState.answers;
    currentState.startTime = new Date(data.currentState.startTime);
    currentState.timeLimit = data.currentState.timeLimit;
    currentState.cheatCount = data.currentState.cheatCount;
    currentState.reviewMode = false;

    // Bật chế độ chống sao chép
    document.body.classList.add('no-select');

    showScreen('quiz');
    renderQuestion();
    startTimer();
}

function checkSavedState() {
    const saved = localStorage.getItem('mathflow_state');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            // Kiểm tra tính hợp lệ và thời gian lưu (dưới 4 tiếng)
            if (data && data.currentState && (Date.now() - data.currentState.savedAt < 4 * 60 * 60 * 1000)) {
                setTimeout(() => {
                    const confirmRestore = confirm(`Phát hiện bài làm chưa hoàn thành của học sinh ${data.currentState.studentName} (Lớp ${data.currentState.studentClass}). Bạn có muốn tiếp tục làm bài không?`);
                    if (confirmRestore) {
                        restoreQuiz(data);
                    } else {
                        clearLocalStorageState();
                    }
                }, 500);
            } else {
                clearLocalStorageState();
            }
        } catch (e) {
            console.error("Lỗi khôi phục trạng thái:", e);
            clearLocalStorageState();
        }
    }
}

// --- Event Listeners ---
elements.startBtn.addEventListener('click', startQuiz);
elements.nextBtn.addEventListener('click', nextQuestion);
elements.prevBtn.addEventListener('click', prevQuestion);
elements.submitBtn.addEventListener('click', submitQuiz);
elements.saveFeedbackBtn.addEventListener('click', saveFeedback);
elements.themeToggle.addEventListener('click', toggleTheme);
elements.reviewBtn.addEventListener('click', enterReviewMode);
elements.exitReviewBtn.addEventListener('click', exitReview);

// Enter to start
elements.studentClass.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startQuiz();
});

// --- Cheating Detection & Screen Lock ---
document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentState.screen === 'quiz' && !currentState.reviewMode) {
        currentState.cheatCount++;
        saveStateToLocalStorage();
        
        const overlay = document.getElementById('cheat-overlay');
        if (overlay) overlay.classList.add('active');
        
        if (currentState.cheatCount >= 3) {
            alert(`Cảnh báo lần ${currentState.cheatCount}: Bạn đã rời tab làm bài quá nhiều lần! Hệ thống tự động thu bài.`);
            if (overlay) overlay.classList.remove('active');
            submitQuiz();
        } else {
            alert(`Cảnh báo lần ${currentState.cheatCount}: Bạn đã rời tab làm bài!`);
            if (overlay) overlay.classList.remove('active');
        }
    }
});

// Sự kiện thay đổi trạng thái toàn màn hình (Đã loại bỏ theo yêu cầu của giáo viên)
/*
document.addEventListener('fullscreenchange', () => {
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    if (!isFullscreen && currentState.screen === 'quiz' && !currentState.reviewMode) {
        currentState.cheatCount++;
        saveStateToLocalStorage();
        alert("Cảnh báo: Bạn đã thoát chế độ toàn màn hình! Hành vi này được coi là một lần gian lận.");
        enterFullscreen(); // Cố gắng phục hồi toàn màn hình
    }
});
*/

// Khởi chạy chế độ bảo mật và kiểm tra bài thi chưa hoàn thành
setupSecurityRestrictions();
checkSavedState();
loadQuestions();

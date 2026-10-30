/**
 * SQL Sleuth - Main Application Logic
 * Game-like interface for SQL mystery solving
 */
let currentModule = null;
let currentSession = null;
let currentFragment = null;
let fragments = {};
let schemaInfo = {};

const API = '/api';

// Audio context for sound effects
let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

// Sound effects using Web Audio API
function playSound(type) {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    
    switch (type) {
        case 'click':
            playTone(ctx, now, 800, 0.05, 'sine', 0.1);
            break;
        case 'success':
            playTone(ctx, now, 523, 0.1, 'sine', 0.15);
            playTone(ctx, now + 0.05, 659, 0.1, 'sine', 0.15);
            playTone(ctx, now + 0.1, 784, 0.2, 'sine', 0.2);
            break;
        case 'unlock':
            playTone(ctx, now, 440, 0.08, 'triangle', 0.2);
            playTone(ctx, now + 0.06, 554, 0.08, 'triangle', 0.2);
            playTone(ctx, now + 0.12, 659, 0.15, 'triangle', 0.25);
            playTone(ctx, now + 0.18, 880, 0.2, 'sine', 0.3);
            break;
        case 'error':
            playTone(ctx, now, 200, 0.15, 'sawtooth', 0.2);
            playTone(ctx, now + 0.08, 150, 0.15, 'sawtooth', 0.2);
            break;
        case 'hint':
            playTone(ctx, now, 600, 0.08, 'sine', 0.15);
            playTone(ctx, now + 0.06, 800, 0.08, 'sine', 0.15);
            break;
        case 'typing':
            playTone(ctx, now, 1200, 0.02, 'square', 0.03);
            break;
    }
}

function playTone(ctx, time, freq, dur, type, vol) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + dur);
}

// DOM elements
const moduleModal = document.getElementById('module-modal');
const moduleList = document.getElementById('module-list');
const solveModal = document.getElementById('solve-modal');
const solveContent = document.getElementById('solve-content');
const solveTitle = document.getElementById('solve-title');
const hintToast = document.getElementById('hint-toast');
const unlockToast = document.getElementById('unlock-toast');
const unlockNotification = document.getElementById('unlock-notification');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const moduleTitle = document.getElementById('module-title');
const moduleSubtitle = document.getElementById('module-subtitle');
const moduleDesc = document.getElementById('module-desc');
const fragmentTabs = document.getElementById('fragment-tabs');
const fragmentContent = document.getElementById('fragment-content');
const resultsPanel = document.getElementById('results-panel');
const resultsTable = document.getElementById('results-table');
const resultsHead = document.getElementById('results-head');
const resultsBody = document.getElementById('results-body');
const resultsEmpty = document.getElementById('results-empty');
const resultsMeta = document.getElementById('results-meta');
const executeBtn = document.getElementById('execute-btn');
const clearBtn = document.getElementById('clear-btn');
const hintBtn = document.getElementById('hint-btn');
const solveBtn = document.getElementById('solve-btn');
const terminalPrompt = document.getElementById('terminal-prompt');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    initParticles();
    await loadModules();
    try {
        moduleModal.showModal();
    } catch (e) {
        console.warn('showModal failed, using open attribute:', e);
        moduleModal.setAttribute('open', '');
    }
    
    // Resume audio context on first user interaction
    document.body.addEventListener('click', () => {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }, { once: true });
});

// Particle background
function initParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    
    const particleCount = 30;
    for (let i = 0; i < particleCount; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.cssText = `
            position: fixed;
            width: ${Math.random() * 3 + 1}px;
            height: ${Math.random() * 3 + 1}px;
            background: ${Math.random() > 0.5 ? 'var(--accent)' : 'var(--gold)'};
            opacity: ${Math.random() * 0.3 + 0.1};
            border-radius: 50%;
            pointer-events: none;
            left: ${Math.random() * 100}vw;
            top: ${Math.random() * 100}vh;
            animation: float ${Math.random() * 20 + 15}s infinite linear;
            z-index: -1;
        `;
        container.appendChild(p);
    }
    
    // Add float animation dynamically
    const style = document.createElement('style');
    style.textContent = `
        @keyframes float {
            0% { transform: translateY(100vh) translateX(0) rotate(0deg); opacity: 0; }
            10% { opacity: 0.3; }
            90% { opacity: 0.3; }
            100% { transform: translateY(-100vh) translateX(${Math.random() * 200 - 100}px) rotate(360deg); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// Initialize editor once (after DOM ready)
let editorInitialized = false;
function ensureEditorInitialized() {
    if (!editorInitialized && typeof initEditor === 'function') {
        initEditor(executeQuery);
        editorInitialized = true;
    }
}

// Module loading
async function loadModules() {
    try {
        const res = await fetch(`${API}/modules`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const modules = await res.json();
        renderModuleList(modules);
    } catch (e) {
        console.error('Failed to load modules:', e);
        moduleList.innerHTML = `<p class="muted" style="color: var(--danger);">VERBINDUNGSFEHLER: ${escapeHtml(e.message)}</p>`;
    }
}

function renderModuleList(modules) {
    moduleList.innerHTML = '';
    modules.forEach((m, i) => {
        const card = document.createElement('button');
        card.className = 'module-card';
        card.type = 'button';
        card.style.animationDelay = `${i * 80}ms`;
        card.innerHTML = `
            <h3>${escapeHtml(m.title)}</h3>
            <p class="muted" style="margin: 10px 0;">${escapeHtml(m.description)}</p>
            <div class="meta">
                <span>👤 ${escapeHtml(m.author)}</span>
                <span>⚡ Schwierigkeit: ${'★'.repeat(m.difficulty)}${'☆'.repeat(5 - m.difficulty)}</span>
                <span>⏱ ~${m.estimated_time_min} Min</span>
            </div>
        `;
        card.addEventListener('click', () => {
            playSound('click');
            selectModule(m.id);
        });
        moduleList.appendChild(card);
    });
}

async function selectModule(moduleId) {
    moduleModal.close();
    try {
        const [moduleRes, schemaRes] = await Promise.all([
            fetch(`${API}/modules/${moduleId}`),
            fetch(`${API}/modules/${moduleId}/schema`),
        ]);
        currentModule = await moduleRes.json();
        schemaInfo = await schemaRes.json();
        setSchemaInfo(schemaInfo);

        const sessionRes = await fetch(`${API}/modules/${moduleId}/session`, { method: 'POST' });
        currentSession = await sessionRes.json();

        fragments = currentModule.fragments;
        currentFragment = currentModule.start_fragment;

        ensureEditorInitialized();
        renderERD(schemaInfo);
        renderUI();
        await loadFragment(currentFragment);
        updateProgress();
        
        // Update subtitle with case info
        if (moduleSubtitle) {
            moduleSubtitle.textContent = `CASE #${moduleId.toUpperCase()} • ${currentModule.fragments ? Object.keys(currentModule.fragments).length : 0} EVIDENCE ITEMS`;
        }
    } catch (e) {
        console.error('Failed to load module:', e);
        playSound('error');
        alert('AKTE KONNTE NICHT GELADEN WERDEN');
        try { moduleModal.showModal(); } catch { moduleModal.setAttribute('open', ''); }
    }
}

// ERD Diagram rendering
function renderERD(schema) {
    const diagramEl = document.getElementById('erd-diagram');
    if (!diagramEl || !schema) return;

    let output = 'DATABASE SCHEMA // ENTITY-RELATIONSHIP\n';
    output += '═'.repeat(54) + '\n\n';

    for (const [table, columns] of Object.entries(schema)) {
        output += `┌─ ${table.toUpperCase()} ` + '─'.repeat(54 - table.length - 4) + '┐\n';
        for (const col of columns) {
            const isPK = col.toLowerCase() === 'id' || col.endsWith('_id');
            const marker = isPK ? ' ◈' : '  ';
            output += `│  ${col}${marker.padStart(30 - col.length, ' ')}│\n`;
        }
        output += '└' + '─'.repeat(56) + '┘\n\n';
    }

    output += 'RELATIONSHIPS\n';
    output += '─'.repeat(54) + '\n';
    
    const relationships = [];
    for (const [table, columns] of Object.entries(schema)) {
        for (const col of columns) {
            if (col.endsWith('_id') && col !== 'id') {
                const refTable = col.replace('_id', 's');
                const actualRef = Object.keys(schema).find(t => 
                    t.toLowerCase() === refTable.toLowerCase() || 
                    t.toLowerCase() === col.replace('_id', '').toLowerCase() + 'e'
                );
                if (actualRef) {
                    relationships.push(`${table}.${col} ────► ${actualRef}.id`);
                } else {
                    relationships.push(`${table}.${col} ────► (${col.replace('_id', '')})`);
                }
            }
        }
    }
    
    if (relationships.length > 0) {
        relationships.forEach(r => output += `  ${r}\n`);
    } else {
        output += '  (No explicit foreign keys detected)\n';
    }

    diagramEl.textContent = output;

    const toggle = document.getElementById('erd-toggle');
    const content = document.getElementById('erd-content');
    if (toggle && content) {
        toggle.onclick = () => {
            playSound('click');
            const expanded = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', !expanded);
            content.hidden = expanded;
        };
    }
}

function renderUI() {
    if (moduleTitle) moduleTitle.textContent = currentModule.title;
    if (moduleDesc) moduleDesc.textContent = currentModule.description;
    if (moduleSubtitle) moduleSubtitle.textContent = `CASE #${currentModule.id.toUpperCase()} • ${Object.keys(fragments).length} EVIDENCE ITEMS`;

    fragmentTabs.innerHTML = '';
    for (const [fid, fspec] of Object.entries(fragments)) {
        const unlocked = isUnlocked(fid);
        const tab = document.createElement('button');
        tab.className = `fragment-tab ${fid === currentFragment ? 'active' : ''} ${unlocked ? 'unlocked' : 'locked'}`;
        tab.dataset.fragment = fid;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', fid === currentFragment);
        tab.innerHTML = `
            ${!unlocked && fid !== currentModule.start_fragment ? '<span class="lock-icon">🔒</span>' : ''}
            ${unlocked ? '<span class="unlock-icon">✓</span>' : ''}
            ${escapeHtml(fspec.title)}
        `;
        tab.addEventListener('click', () => {
            playSound('click');
            switchFragment(fid);
        });
        fragmentTabs.appendChild(tab);
    }
}

function isUnlocked(fragmentId) {
    if (!currentSession) return false;
    if (fragmentId === currentModule.start_fragment) return true;
    return currentSession.unlocked_fragments?.includes(fragmentId) ?? false;
}

async function switchFragment(fragmentId) {
    if (!isUnlocked(fragmentId) && fragmentId !== currentModule.start_fragment) {
        playSound('error');
        showToast('EVIDENCE LOCKED — REQUIRES VALID QUERY', 'hint');
        return;
    }
    playSound('click');
    currentFragment = fragmentId;
    await loadFragment(fragmentId);
    renderUI();
}

// Simple direct HTML render (no typewriter)
async function typewriterHTML(element, html) {
    element.innerHTML = html;
}

// Load fragment with typewriter effect
async function loadFragment(fragmentId) {
    try {
        const res = await fetch(`${API}/modules/${currentModule.id}/fragment/${fragmentId}?session_id=${currentSession.session_id}`);
        if (res.status === 403) {
            fragmentContent.innerHTML = '<div class="muted" style="padding: 40px; text-align: center;">🔒 EVIDENCE CLASSIFIED — INSUFFICIENT CLEARANCE</div>';
            return;
        }
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        if (!data.content) {
            console.error('Fragment data missing content:', data);
            fragmentContent.innerHTML = '<p class="muted">FEHLER: INHALT NICHT VERFÜGBAR</p>';
            return;
        }
        
        const html = marked.parse(data.content);
        
        // Render HTML directly (no typewriter)
        await typewriterHTML(fragmentContent, html);
        
    } catch (e) {
        console.error('Failed to load fragment:', e);
        fragmentContent.innerHTML = '<p class="muted">FEHLER BEIM LADEN DER AKTE</p>';
    }
}

// Query execution
executeBtn.addEventListener('click', executeQuery);
clearBtn.addEventListener('click', () => {
    playSound('click');
    setEditorValue('-- ENTER SQL QUERY\nSELECT * FROM personen LIMIT 10;');
    focusEditor();
});
hintBtn.addEventListener('click', showHint);
solveBtn.addEventListener('click', attemptSolve);

async function executeQuery() {
    const sql = getEditorValue().trim();
    if (!sql) return;

    executeBtn.disabled = true;
    executeBtn.textContent = '⏳ PROCESSING...';
    executeBtn.style.opacity = '0.7';

    try {
        const res = await fetch(`${API}/modules/${currentModule.id}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: currentSession.session_id, sql }),
        });
        const result = await res.json();
        displayResults(result);

        if (result.unlocked_fragment) {
            playSound('unlock');
            showUnlockNotification(result.unlocked_fragment);
            showUnlockToast(result.unlocked_fragment);
            updateProgress();
            solveBtn.disabled = false;
            // Mark tab as unlocked
            const tab = fragmentTabs.querySelector(`[data-fragment="${result.unlocked_fragment}"]`);
            if (tab) {
                tab.classList.remove('locked');
                tab.classList.add('unlocked');
            }
        } else if (result.error) {
            playSound('error');
            shakeElement(resultsPanel);
        } else {
            playSound('success');
        }
    } catch (e) {
        console.error('Query failed:', e);
        playSound('error');
        showError('QUERY EXECUTION FAILED');
        shakeElement(resultsPanel);
    } finally {
        executeBtn.disabled = false;
        executeBtn.textContent = '▶ EXECUTE';
        executeBtn.style.opacity = '1';
    }
}

function displayResults(result) {
    resultsPanel.hidden = false;
    resultsMeta.textContent = `${result.row_count} ROWS • ${result.execution_time_ms.toFixed(1)}MS`;

    if (result.error) {
        resultsHead.innerHTML = '';
        resultsBody.innerHTML = '';
        resultsEmpty.hidden = false;
        resultsEmpty.textContent = `ERROR: ${escapeHtml(result.error)}`;
        return;
    }

    if (result.row_count === 0) {
        resultsHead.innerHTML = '';
        resultsBody.innerHTML = '';
        resultsEmpty.hidden = false;
        resultsEmpty.textContent = 'NO MATCHES FOUND';
        return;
    }

    resultsEmpty.hidden = true;

    // Headers
    resultsHead.innerHTML = '<tr>' + result.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('') + '</tr>';

    // Rows with staggered animation
    resultsBody.innerHTML = result.rows.map((row, i) =>
        `<tr style="animation-delay: ${i * 30}ms;">` + 
        row.map(cell => `<td>${escapeHtml(String(cell ?? 'NULL'))}</td>`).join('') + 
        '</tr>'
    ).join('');
}

// Progress & unlocks
function updateProgress() {
    const total = Object.keys(fragments).length;
    const unlocked = (currentSession.unlocked_fragments?.length ?? 0) + 1; // Start fragment counts
    const pct = (unlocked / total) * 100;
    
    progressBar.style.setProperty('--progress-width', `${pct}%`);
    progressBar.style.setProperty('--progress', `${pct}%`);
    if (progressText) progressText.textContent = `${unlocked} / ${total}`;
}

function showUnlockToast(fragmentId) {
    const title = fragments[fragmentId]?.title || fragmentId;
    if (unlockToast) {
        unlockToast.textContent = `🔓 EVIDENCE UNLOCKED: ${title.toUpperCase()}`;
        unlockToast.hidden = false;
        setTimeout(() => { unlockToast.hidden = true; }, 5000);
    }
}

function showUnlockNotification(fragmentId) {
    const title = fragments[fragmentId]?.title || fragmentId;
    if (unlockNotification) {
        unlockNotification.textContent = `NEW EVIDENCE: ${title.toUpperCase()}`;
        unlockNotification.hidden = false;
        unlockNotification.style.animation = 'slideDown 0.5s cubic-bezier(0.4, 0, 0.2, 1), fadeOut 0.5s 3s forwards';
        setTimeout(() => { unlockNotification.hidden = true; }, 3500);
    }
}

// Shake animation for errors
function shakeElement(el) {
    if (!el) return;
    el.style.animation = 'shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97)';
    el.addEventListener('animationend', () => {
        el.style.animation = '';
    }, { once: true });
}

// Hints
async function showHint() {
    if (!currentFragment) return;
    playSound('hint');
    hintBtn.classList.add('pulse-anim');
    setTimeout(() => hintBtn.classList.remove('pulse-anim'), 1500);

    let hintText = 'NO INTEL AVAILABLE.';

    for (const [qkey, qspec] of Object.entries(currentModule.queries)) {
        for (const [fid, fspec] of Object.entries(fragments)) {
            if (fspec.unlocked_by === qkey && !isUnlocked(fid)) {
                hintText = qspec.hint || `ATTEMPT: ${qspec.description}`;
                break;
            }
        }
    }

    showToast(hintText, 'hint');

    if (currentSession) {
        await fetch(`${API}/modules/${currentModule.id}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: currentSession.session_id, sql: '', hint: true }),
        }).catch(() => {});
    }
}

function showToast(message, type = 'info') {
    if (hintToast) {
        hintToast.textContent = message;
        hintToast.hidden = false;
        setTimeout(() => { hintToast.hidden = true; }, 6000);
    }
}

// Solve attempt
async function attemptSolve() {
    playSound('click');
    try {
        const res = await fetch(`${API}/modules/${currentModule.id}/solve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: currentSession.session_id }),
        });
        const result = await res.json();

        if (result.success) {
            playSound('unlock');
            solveTitle.textContent = 'CASE CLOSED';
            solveContent.innerHTML = marked.parse(result.solution) + renderStats(result.stats);
        } else {
            playSound('error');
            solveTitle.textContent = 'CASE INCOMPLETE';
            const missing = result.total.filter(f => !result.unlocked.includes(f));
            solveContent.innerHTML = `
                <p>INSUFFICIENT EVIDENCE FOR CONVICTION.</p>
                <p>MISSING: ${missing.map(f => fragments[f]?.title || f).join(', ')}</p>
                ${renderStats(result.stats)}
            `;
        }
        solveModal.showModal();
    } catch (e) {
        console.error('Solve failed:', e);
        playSound('error');
        showError('RESOLUTION CHECK FAILED');
    }
}

function renderStats(stats) {
    if (!stats) return '';
    return `
        <hr style="margin: 20px 0; border-color: var(--border);">
        <h3>CASE STATISTICS</h3>
        <div class="stat-row"><span class="stat-label">INVESTIGATION TIME</span><span class="stat-value">${Math.round(stats.duration_seconds / 60)} MIN ${Math.round(stats.duration_seconds % 60)} SEC</span></div>
        <div class="stat-row"><span class="stat-label">QUERIES EXECUTED</span><span class="stat-value">${stats.queries_count}</span></div>
        <div class="stat-row"><span class="stat-label">INTEL REQUESTS</span><span class="stat-value">${stats.hints_used}</span></div>
    `;
}

// Utility
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(msg) {
    resultsPanel.hidden = false;
    resultsHead.innerHTML = '';
    resultsBody.innerHTML = '';
    resultsEmpty.hidden = false;
    resultsEmpty.textContent = msg;
    resultsEmpty.style.color = 'var(--danger)';
    shakeElement(resultsPanel);
}

// Markdown parser - improved version
const marked = {
    parse(md) {
        if (!md) return '';
        
        let html = md;
        
        // Normalize line endings
        html = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // First, protect code blocks
        const codeBlocks = [];
        html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
            const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
            codeBlocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
            return placeholder;
        });
        
        // Protect inline code
        const inlineCode = [];
        html = html.replace(/`([^`]+)`/g, (match, code) => {
            const placeholder = `__INLINE_CODE_${inlineCode.length}__`;
            inlineCode.push(`<code>${escapeHtml(code)}</code>`);
            return placeholder;
        });
        
        // Block elements
        // Headers
        html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
        
        // Blockquotes
        html = html.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');
        
        // Horizontal rule
        html = html.replace(/^---$/gm, '<hr>');
        html = html.replace(/^\*\*\*$/gm, '<hr>');
        
        // Lists
        html = html.replace(/^[-*] (.*$)/gm, '<li>$1</li>');
        html = html.replace(/^\d+\. (.*$)/gm, '<li>$1</li>');
        // Wrap consecutive li in ul/ol
        html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
            if (match.includes('<ol>') || match.includes('<ul>')) return match;
            const isOrdered = /^\d+\./.test(match);
            return `<${isOrdered ? 'ol' : 'ul'}>\n${match}\n</${isOrdered ? 'ol' : 'ul'}>`;
        });
        
        // Paragraphs - split by double newlines
        const paragraphs = html.split('\n\n');
        html = paragraphs.map(p => {
            p = p.trim();
            if (!p) return '';
            // Don't wrap block elements in <p>
            if (/^<(h[1-3]|blockquote|ul|ol|hr|pre|table)/.test(p)) return p;
            return `<p>${p}</p>`;
        }).join('\n\n');
        
        // Restore code blocks BEFORE inline processing
        codeBlocks.forEach((block, i) => {
            html = html.replace(`__CODE_BLOCK_${i}__`, block);
        });
        
        // Restore inline code BEFORE inline processing
        inlineCode.forEach((code, i) => {
            html = html.replace(`__INLINE_CODE_${i}__`, code);
        });
        
        // Inline elements
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
        html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
        html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
        
        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        
        // Custom tags for game feel
        html = html.replace(/\[EVIDENCE:([^\]]+)\]/g, '<span class="evidence-tag">$1</span>');
        html = html.replace(/\[LOCATION:([^\]]+)\]/g, '<span class="location-tag">$1</span>');
        
        // Clean up empty paragraphs
        html = html.replace(/<p>\s*<\/p>/g, '');
        html = html.replace(/<p>\s*(<br\s*\/?>)\s*<\/p>/g, '');
        
        return html;
    }
};

window.marked = marked;
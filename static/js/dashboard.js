/**
 * QueryMetrics — Database Query Performance Analyzer & Optimization System
 * Interactive Animation Engine, 3D Tilt Cards, and Micro-Interaction Controller
 */

let catalogData = [];
let comparisonChart = null;
let lastBaseline = null;
let lastOptimized = null;

const WORKLOAD_DESCRIPTIONS = {
    1: {
        category: "FILTER (WHERE)",
        explanation: "Filters 100,000 records on low-cardinality status column (status = 'ACTIVE'). Without an index, the storage engine reads all data blocks sequentially (Full Table Scan O(N)). With secondary B-Tree index idx_demo_records_status, the optimizer uses an index scan (ref O(log N)) to jump directly to matching leaf pointers."
    },
    2: {
        category: "COMPOSITE FILTER (AND)",
        explanation: "Evaluates multi-attribute filter condition (status = 'ACTIVE' AND category = 'ELECTRONICS'). Demonstrates the power of compound indexing: composite index idx_demo_status_category covers both attributes in a single B-Tree lookup, avoiding secondary row filtering."
    },
    3: {
        category: "SORT & RANGE (ORDER BY + LIMIT)",
        explanation: "Performs range check (amount > 5000) with ORDER BY amount DESC LIMIT 100. Highlights filesort overhead: without an index, the engine buffers unsorted rows into temporary memory blocks to sort them. An index avoids filesort entirely."
    },
    4: {
        category: "AGGREGATION (GROUP BY)",
        explanation: "Computes COUNT(*), AVG(amount), and SUM(amount) across categories and statuses. Evaluates temporary table creation and memory buffer allocation during hash/sort aggregation."
    },
    5: {
        category: "RANGE SCAN (DATETIME)",
        explanation: "Evaluates range scan on created_at datetime column. Evaluates index range scan selectivity and leaf node boundary traversal."
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    fetchSystemStatus();
    fetchCatalog();
    initTiltEffect();
    initCursorSpotlight();
});

// -----------------------------------------------------------------------------
// INTERACTIVE 3D PERSPECTIVE TILT ON MOUSE HOVER
// -----------------------------------------------------------------------------
function initTiltEffect() {
    const cards = document.querySelectorAll('.tilt-card');
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            // Subtle tilt between -4deg and +4deg
            const rotateX = ((y - centerY) / centerY) * -4;
            const rotateY = ((x - centerX) / centerX) * 4;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)';
        });
    });
}

// -----------------------------------------------------------------------------
// SUBTLE CURSOR SPOTLIGHT TRACKING
// -----------------------------------------------------------------------------
function initCursorSpotlight() {
    const shell = document.getElementById('mainShell');
    if (!shell) return;
    shell.addEventListener('mousemove', (e) => {
        const rect = shell.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        shell.style.setProperty('--mouse-x', `${x}px`);
        shell.style.setProperty('--mouse-y', `${y}px`);
    });
}

// -----------------------------------------------------------------------------
// SMOOTH NUMBER COUNTER ANIMATION
// -----------------------------------------------------------------------------
function animateCounter(elementId, targetValue, duration = 800, isFloat = false, suffix = '') {
    const el = document.getElementById(elementId);
    if (!el) return;

    const startValue = parseFloat(el.getAttribute('data-val') || '0') || 0;
    const startTime = performance.now();
    el.setAttribute('data-val', targetValue);

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Quartic Out Easing
        const ease = 1 - Math.pow(1 - progress, 4);
        const current = startValue + (targetValue - startValue) * ease;

        if (isFloat) {
            el.innerText = `${current.toFixed(2)}${suffix}`;
        } else {
            el.innerText = `${Math.round(current).toLocaleString()}${suffix}`;
        }

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            if (isFloat) {
                el.innerText = `${targetValue.toFixed(2)}${suffix}`;
            } else {
                el.innerText = `${targetValue.toLocaleString()}${suffix}`;
            }
        }
    }
    requestAnimationFrame(update);
}

// -----------------------------------------------------------------------------
// "NEXT PART MOVE" INTERACTION
// -----------------------------------------------------------------------------
function highlightNextSection() {
    const section = document.getElementById('workbenchSection');
    if (!section) return;

    section.classList.remove('flash-highlight');
    void section.offsetWidth; // Force DOM reflow
    section.classList.add('flash-highlight');

    // Smooth scroll down to next part if on smaller viewports
    if (window.innerWidth < 1024) {
        section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// -----------------------------------------------------------------------------
// TAB SWITCHBOARD WITH ENTRANCE ANIMATION
// -----------------------------------------------------------------------------
function switchTab(tabId) {
    const tabs = ['lab', 'catalog', 'procedure', 'view', 'audit'];
    tabs.forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        const btn = document.getElementById(`tabBtn-${t}`);
        if (el && btn) {
            if (t === tabId) {
                el.classList.remove('hidden');
                el.classList.remove('tab-enter');
                void el.offsetWidth; // Trigger reflow for animation restart
                el.classList.add('tab-enter');

                btn.className = 'tab-link text-[#141414] font-bold border-b-2 border-[#141414] pb-1 transition-all';
            } else {
                el.classList.add('hidden');
                btn.className = 'tab-link text-neutral-500 hover:text-[#141414] font-medium transition-all';
            }
        }
    });

    if (tabId === 'procedure') fetchStoredProcedureHistory();
    if (tabId === 'view') fetchSummaryView();
    if (tabId === 'audit') fetchAuditLogs();
}

// -----------------------------------------------------------------------------
// SYSTEM STATUS & INDEX SWITCHBOARD
// -----------------------------------------------------------------------------
async function fetchSystemStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        animateCounter('statRecordsCount', data.records_count || 0, 900);

        // Engine Status Text
        const text = document.getElementById('engineStatusText');
        if (text) {
            if (data.engine === 'MYSQL') {
                text.innerText = `MySQL 8.0 (${data.mysql_config?.database || 'Connected'})`;
            } else {
                text.innerText = `SQLite Engine`;
            }
        }

        // Update Index experiment badges
        const activeIdxNames = (data.active_indexes || []).map(i => i.name);
        
        // Status Index
        const statusBadge = document.getElementById('badge-status-idx');
        const statusBtn = document.getElementById('btn-status-idx');
        if (statusBadge && statusBtn) {
            if (activeIdxNames.includes('idx_demo_records_status')) {
                statusBadge.innerText = 'ACTIVE (INDEXED)';
                statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-[#141414] text-white transition-all';
                statusBtn.innerText = 'Drop Index';
                statusBtn.className = 'btn-lift w-full py-1.5 text-xs font-semibold rounded-full bg-white/80 hover:bg-white text-neutral-800 transition shadow-xs';
            } else {
                statusBadge.innerText = 'DISABLED (FULL SCAN)';
                statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-mono font-medium bg-black/10 text-neutral-700 transition-all';
                statusBtn.innerText = 'Create Index';
                statusBtn.className = 'btn-lift w-full py-1.5 text-xs font-bold rounded-full bg-[#141414] hover:bg-neutral-800 text-white transition shadow-sm';
            }
        }

        // Composite Index
        const compBadge = document.getElementById('badge-composite-idx');
        const compBtn = document.getElementById('btn-composite-idx');
        if (compBadge && compBtn) {
            if (activeIdxNames.includes('idx_demo_status_category')) {
                compBadge.innerText = 'ACTIVE (INDEXED)';
                compBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-[#141414] text-white transition-all';
                compBtn.innerText = 'Drop Index';
                compBtn.className = 'btn-lift w-full py-1.5 text-xs font-semibold rounded-full bg-white/80 hover:bg-white text-neutral-800 transition shadow-xs';
            } else {
                compBadge.innerText = 'DISABLED (FULL SCAN)';
                compBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-mono font-medium bg-black/10 text-neutral-700 transition-all';
                compBtn.innerText = 'Create Index';
                compBtn.className = 'btn-lift w-full py-1.5 text-xs font-bold rounded-full bg-[#141414] hover:bg-neutral-800 text-white transition shadow-sm';
            }
        }

    } catch (err) {
        console.error('Error fetching system status:', err);
    }
}

// -----------------------------------------------------------------------------
// QUERY CATALOG CONTROLLER
// -----------------------------------------------------------------------------
async function fetchCatalog() {
    try {
        const res = await fetch('/api/catalog');
        catalogData = await res.json();
        
        const select = document.getElementById('querySelect');
        const spSelect = document.getElementById('spQuerySelect');
        const tableBody = document.getElementById('catalogTableBody');
        
        if (select) select.innerHTML = '';
        if (spSelect) spSelect.innerHTML = '';
        if (tableBody) tableBody.innerHTML = '';

        catalogData.forEach(q => {
            if (select) {
                const opt = document.createElement('option');
                opt.value = q.query_id;
                opt.innerText = `Q${q.query_id}: ${q.query_name}`;
                select.appendChild(opt);
            }

            if (spSelect) {
                const spOpt = document.createElement('option');
                spOpt.value = q.query_id;
                spOpt.innerText = `Q${q.query_id}: ${q.query_name}`;
                spSelect.appendChild(spOpt);
            }

            const meta = WORKLOAD_DESCRIPTIONS[q.query_id] || { category: "GENERAL", explanation: q.description };

            if (tableBody) {
                const tr = document.createElement('tr');
                tr.className = "table-row-hover hover:bg-[#f4efe4]/60 transition border-b border-[#e7e4dc]";
                tr.innerHTML = `
                    <td class="py-3 px-3 font-mono font-bold text-neutral-500">#${q.query_id}</td>
                    <td class="py-3 px-3 font-bold text-[#141414]">
                        ${q.query_name}
                        <div class="text-[10px] text-neutral-600 bg-[#ece8df] px-2 py-0.5 rounded-full font-mono mt-0.5 font-bold inline-block border border-[#d6d0c2]">${meta.category}</div>
                    </td>
                    <td class="py-3 px-3 font-mono text-neutral-700 max-w-xs truncate">${q.query_sql}</td>
                    <td class="py-3 px-3 text-neutral-600 font-sans text-xs">${q.description}</td>
                    <td class="py-3 px-3 text-right">
                        <button onclick="selectAndBenchmark(${q.query_id})" class="btn-lift px-3.5 py-1 text-xs font-bold rounded-full bg-[#141414] hover:bg-neutral-800 text-white transition shadow-xs">
                            Select
                        </button>
                    </td>
                `;
                tableBody.appendChild(tr);
            }
        });

        if (catalogData.length > 0) onQuerySelected();
    } catch (err) {
        console.error('Failed to load catalog:', err);
    }
}

function onQuerySelected() {
    const qid = parseInt(document.getElementById('querySelect').value);
    const item = catalogData.find(q => q.query_id === qid);
    if (item) {
        document.getElementById('querySqlDisplay').innerText = item.query_sql;
        const meta = WORKLOAD_DESCRIPTIONS[qid] || { category: "GENERAL", explanation: item.description };
        document.getElementById('queryCategoryTag').innerText = meta.category;
        document.getElementById('queryDescDisplay').innerText = meta.explanation;
        
        // Gentle pulse on workbench to signal update
        highlightNextSection();
    }
}

function selectAndBenchmark(queryId) {
    document.getElementById('querySelect').value = queryId;
    onQuerySelected();
    switchTab('lab');
}

// -----------------------------------------------------------------------------
// 1-CLICK AUTOMATED COMPARISON (Core Lab Demo with Cool Moves)
// -----------------------------------------------------------------------------
async function runAutomatedComparison() {
    const queryId = document.getElementById('querySelect').value;
    const btn = document.getElementById('autoCompareBtn');
    const chartCard = document.getElementById('chartCard');
    if (!queryId) return;

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i><span>Comparing...</span>`;
    
    // Add glowing pulse to chart card during run
    if (chartCard) chartCard.classList.add('benchmarking-active');

    try {
        const res = await fetch('/api/benchmark/compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query_id: queryId })
        });
        const data = await res.json();
        if (data.error) {
            alert(`Error: ${data.error}`);
            return;
        }

        const b = data.baseline;
        const o = data.optimized;
        const exp = data.explanation;

        lastBaseline = { ms: b.elapsed_ms };
        lastOptimized = { ms: o.elapsed_ms };

        // Animated counting for latency
        animateCounter('optimizedTime', o.elapsed_ms, 700, true, ' ms');

        const optMethodEl = document.getElementById('optimizedMethod');
        if (optMethodEl) optMethodEl.innerText = `ref (B-Tree)`;

        // Speedup Badge with Pop-in Animation
        const badge = document.getElementById('speedupBadge');
        const text = document.getElementById('speedupText');
        if (badge && text) {
            badge.classList.remove('hidden');
            badge.classList.remove('pop-in');
            void badge.offsetWidth; // Reflow
            badge.classList.add('pop-in');
            text.innerText = `${exp.speedup_pct}% Latency Drop`;
        }

        // Update Chart with smooth spring animation
        updateChart();

        // Update Explanation
        const diagIo = document.getElementById('diagIoImpact');
        const diagForm = document.getElementById('diagFormula');
        if (diagIo) diagIo.innerText = exp.buffer_pool_note;
        if (diagForm) diagForm.innerText = `((T_base - T_opt) / T_base) * 100 = ${exp.speedup_pct}%`;

        // Execution Plan Output
        const planText = o.plan?.explain_analyze || JSON.stringify(o.plan, null, 2);
        const expOutput = document.getElementById('explainOutput');
        if (expOutput) {
            expOutput.innerText = `=== OPTIMIZED EXECUTION PLAN (EXPLAIN ANALYZE) ===\n${planText}\n\n=== BASELINE EXECUTION PLAN (ALL FULL SCAN) ===\n${b.plan?.explain_analyze || JSON.stringify(b.plan, null, 2)}`;
        }

        // Trigger smooth move / highlight on next part
        highlightNextSection();

        await fetchSystemStatus();

    } catch (err) {
        console.error('Comparison failed:', err);
        alert('Comparative benchmark failed.');
    } finally {
        if (chartCard) chartCard.classList.remove('benchmarking-active');
        btn.disabled = false;
        btn.innerHTML = `<span>Run comparison</span><span class="arrow-move text-sm font-mono">&nearr;</span>`;
    }
}

// -----------------------------------------------------------------------------
// SINGLE BENCHMARK RUNNER
// -----------------------------------------------------------------------------
async function runBenchmark() {
    const queryId = document.getElementById('querySelect').value;
    const testLabel = document.getElementById('testLabelInput').value.trim() || 'SINGLE_RUN';
    const reps = parseInt(document.getElementById('repsSelect').value) || 1;
    const runBtn = document.getElementById('runBtn');
    const chartCard = document.getElementById('chartCard');

    if (!queryId) return;

    runBtn.disabled = true;
    runBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-[10px]"></i>`;
    if (chartCard) chartCard.classList.add('benchmarking-active');

    try {
        const res = await fetch('/api/benchmark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query_id: queryId,
                test_label: testLabel,
                repetitions: reps
            })
        });
        const result = await res.json();
        if (result.error) {
            alert(`Error: ${result.error}`);
            return;
        }

        const avgMs = result.average_elapsed_ms;
        const plan = result.latest_result?.plan || {};
        const rows = result.latest_result?.rows_returned || 0;

        let scanType = 'ALL (Full Table Scan)';
        if (plan.tabular_plan) {
            const planStr = JSON.stringify(plan.tabular_plan);
            if (planStr.includes('ref') || planStr.includes('eq_ref') || planStr.includes('SEARCH TABLE') || planStr.includes('INDEX')) {
                scanType = 'ref (Index Scan)';
            }
        }

        if (testLabel.toUpperCase().includes('BASE') || !lastBaseline) {
            lastBaseline = { ms: avgMs, scanType: scanType, rows: rows, label: testLabel };
            document.getElementById('testLabelInput').value = 'OPTIMIZED_INDEX';
        } else {
            lastOptimized = { ms: avgMs, scanType: scanType, rows: rows, label: testLabel };
            animateCounter('optimizedTime', avgMs, 600, true, ' ms');
            const optMethodEl = document.getElementById('optimizedMethod');
            if (optMethodEl) optMethodEl.innerText = scanType;
            document.getElementById('testLabelInput').value = 'BASELINE_SCAN';
        }

        if (lastBaseline && lastOptimized) {
            const b = lastBaseline.ms;
            const o = lastOptimized.ms;
            if (b > 0) {
                const pct = (((b - o) / b) * 100).toFixed(1);
                const badge = document.getElementById('speedupBadge');
                const text = document.getElementById('speedupText');
                if (badge && text) {
                    badge.classList.remove('hidden');
                    badge.classList.remove('pop-in');
                    void badge.offsetWidth;
                    badge.classList.add('pop-in');
                    text.innerText = `${pct}% Latency Drop`;
                }
                const diagForm = document.getElementById('diagFormula');
                if (diagForm) diagForm.innerText = `((T_base - T_opt) / T_base) * 100 = ${pct}%`;
            }
        }

        updateChart();

        const explainOutput = document.getElementById('explainOutput');
        if (explainOutput) {
            if (plan.explain_analyze) {
                explainOutput.innerText = plan.explain_analyze;
            } else {
                explainOutput.innerText = JSON.stringify(plan, null, 2);
            }
        }

        highlightNextSection();
        await fetchSystemStatus();

    } catch (err) {
        console.error('Execution failed:', err);
    } finally {
        if (chartCard) chartCard.classList.remove('benchmarking-active');
        runBtn.disabled = false;
        runBtn.innerHTML = `<i class="fa-solid fa-play text-[10px]"></i>`;
    }
}

// -----------------------------------------------------------------------------
// INDEX EXPERIMENT TOGGLER
// -----------------------------------------------------------------------------
async function toggleIndex(indexName) {
    const statusBadge = indexName === 'idx_demo_records_status' 
        ? document.getElementById('badge-status-idx') 
        : document.getElementById('badge-composite-idx');
        
    const isCurrentlyActive = statusBadge?.innerText.includes('ACTIVE');
    const targetAction = isCurrentlyActive ? 'DROP' : 'CREATE';

    try {
        const res = await fetch('/api/indexes/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index_name: indexName, action: targetAction })
        });
        const data = await res.json();
        if (data.error) {
            alert(`Index toggle error: ${data.error}`);
            return;
        }
        await fetchSystemStatus();
        highlightNextSection();
    } catch (err) {
        console.error('Failed to toggle index:', err);
    }
}

// -----------------------------------------------------------------------------
// MINIMAL EDITORIAL PALETTE CHART.JS CONTROLLER (WITH DYNAMIC SPRING ANIMATIONS)
// -----------------------------------------------------------------------------
function initChart() {
    const canvas = document.getElementById('comparisonChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Baseline (No Index)', 'Optimized (Indexed)'],
            datasets: [{
                label: 'Latency (ms)',
                data: [0, 0],
                backgroundColor: [
                    '#a3a3a3',   // Neutral-400 (Baseline Scan)
                    '#141414'    // Solid Pitch Charcoal (B-Tree Index Scan)
                ],
                borderColor: [
                    '#737373',
                    '#000000'
                ],
                borderWidth: 1.5,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 800,
                easing: 'easeOutQuart'
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(231, 228, 220, 0.8)' },
                    ticks: { color: '#737373', font: { family: 'Geist Mono, monospace', size: 10 } },
                    title: { display: false }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#141414', font: { weight: '600', size: 11, family: 'Plus Jakarta Sans, sans-serif' } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#141414',
                    titleColor: '#ffffff',
                    bodyColor: '#faf8f5',
                    borderColor: '#e7e4dc',
                    borderWidth: 1,
                    padding: 8,
                    callbacks: {
                        label: (ctx) => ` Latency: ${ctx.raw} ms`
                    }
                }
            }
        }
    });
}

function updateChart() {
    if (!comparisonChart) return;
    const bTime = lastBaseline ? lastBaseline.ms : 0;
    const oTime = lastOptimized ? lastOptimized.ms : 0;
    comparisonChart.data.datasets[0].data = [bTime, oTime];
    comparisonChart.update();
}

// -----------------------------------------------------------------------------
// STORED PROCEDURE EXPLORER (`GetBenchmarkHistory`)
// -----------------------------------------------------------------------------
async function fetchStoredProcedureHistory() {
    const qid = document.getElementById('spQuerySelect')?.value || 1;
    const tableBody = document.getElementById('spTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-neutral-400 font-mono"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Executing CALL GetBenchmarkHistory...</td></tr>';

    try {
        const res = await fetch(`/api/history/${qid}`);
        const rows = await res.json();
        tableBody.innerHTML = '';

        if (!rows || rows.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-neutral-500 font-mono">No benchmark runs recorded yet for this query.</td></tr>';
            return;
        }

        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = "table-row-hover hover:bg-[#f4efe4]/60 font-mono text-[11px] transition border-b border-[#e7e4dc]";
            tr.innerHTML = `
                <td class="py-3 px-3 font-bold text-neutral-500">#${r.result_id}</td>
                <td class="py-3 px-3 text-neutral-600">Run #${r.run_id}</td>
                <td class="py-3 px-3 text-[#141414] font-sans font-semibold">${r.query_name}</td>
                <td class="py-3 px-3"><span class="px-2 py-0.5 rounded-full bg-[#ece8df] text-neutral-800 border border-[#d6d0c2] text-[10px] font-bold">${r.test_label}</span></td>
                <td class="py-3 px-3 font-bold text-[#141414]">${r.elapsed_ms.toFixed(3)} ms</td>
                <td class="py-3 px-3 text-neutral-700">${(r.rows_returned || 0).toLocaleString()}</td>
                <td class="py-3 px-3 text-neutral-500">${r.recorded_at}</td>
            `;
            tableBody.appendChild(tr);
        });
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-rose-500 font-mono">Failed: ${err}</td></tr>`;
    }
}

// -----------------------------------------------------------------------------
// DATABASE VIEW EXPLORER (`BenchmarkSummary`)
// -----------------------------------------------------------------------------
async function fetchSummaryView() {
    const tableBody = document.getElementById('viewTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-neutral-400 font-mono"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Querying View BenchmarkSummary...</td></tr>';

    try {
        const res = await fetch('/api/view/summary');
        const rows = await res.json();
        tableBody.innerHTML = '';

        if (!rows || rows.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-neutral-500 font-mono">View contains 0 rows. Run a benchmark test in the Lab first.</td></tr>';
            return;
        }

        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = "table-row-hover hover:bg-[#f4efe4]/60 font-mono text-[11px] transition border-b border-[#e7e4dc]";
            tr.innerHTML = `
                <td class="py-3 px-3 font-bold text-neutral-500">#${r.result_id}</td>
                <td class="py-3 px-3 text-[#141414] font-sans font-semibold">${r.query_name}</td>
                <td class="py-3 px-3"><span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#d8eed2] text-[#142315] border border-[#c2e2ba]">${r.status}</span></td>
                <td class="py-3 px-3 text-neutral-700">${r.test_label}</td>
                <td class="py-3 px-3 font-bold text-[#141414]">${r.elapsed_ms.toFixed(3)} ms</td>
                <td class="py-3 px-3 text-neutral-700">${(r.rows_returned || 0).toLocaleString()}</td>
                <td class="py-3 px-3 text-neutral-500">${r.recorded_at}</td>
            `;
            tableBody.appendChild(tr);
        });
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-rose-500 font-mono">Failed: ${err}</td></tr>`;
    }
}

// -----------------------------------------------------------------------------
// TRIGGER AUDIT TRAIL (`BenchmarkAudit`)
// -----------------------------------------------------------------------------
async function fetchAuditLogs() {
    const tableBody = document.getElementById('auditTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-neutral-400 font-mono"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Reading BenchmarkAudit table...</td></tr>';

    try {
        const res = await fetch('/api/audit');
        const rows = await res.json();
        tableBody.innerHTML = '';

        if (!rows || rows.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-neutral-500 font-mono">No trigger audit logs registered yet.</td></tr>';
            return;
        }

        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = "table-row-hover hover:bg-[#f4efe4]/60 font-mono text-[11px] transition border-b border-[#e7e4dc]";
            tr.innerHTML = `
                <td class="py-3 px-3 font-bold text-neutral-500">#${r.audit_id}</td>
                <td class="py-3 px-3 text-neutral-600">Result #${r.result_id}</td>
                <td class="py-3 px-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#fae5cb] text-[#2a2016] border border-[#f2d5b5]">${r.event_type}</span></td>
                <td class="py-3 px-3 text-neutral-500">${r.event_time}</td>
                <td class="py-3 px-3 text-neutral-700 font-sans text-xs">${r.details}</td>
            `;
            tableBody.appendChild(tr);
        });
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-rose-500 font-mono">Failed: ${err}</td></tr>`;
    }
}

// -----------------------------------------------------------------------------
// DATASET SEEDING
// -----------------------------------------------------------------------------
async function seedAdditionalRows(count) {
    if (!confirm(`Generate ${count.toLocaleString()} additional records into DemoRecords?`)) return;
    try {
        const res = await fetch('/api/seed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: count })
        });
        const data = await res.json();
        alert(data.message || data.error);
        fetchSystemStatus();
    } catch (err) {
        alert('Seeding error: ' + err);
    }
}

// -----------------------------------------------------------------------------
// ENGINE CONFIG MODAL
// -----------------------------------------------------------------------------
function openConfigModal() {
    document.getElementById('configModal').classList.remove('hidden');
}

function closeConfigModal() {
    document.getElementById('configModal').classList.add('hidden');
    document.getElementById('cfgFeedback').innerText = '';
}

async function testAndSaveMysqlConfig() {
    const feedback = document.getElementById('cfgFeedback');
    feedback.className = 'text-xs text-center text-neutral-500';
    feedback.innerText = 'Verifying connection to MySQL server...';

    const payload = {
        host: document.getElementById('cfgHost').value.trim(),
        port: parseInt(document.getElementById('cfgPort').value),
        database: document.getElementById('cfgDb').value.trim(),
        user: document.getElementById('cfgUser').value.trim(),
        password: document.getElementById('cfgPass').value
    };

    try {
        const res = await fetch('/api/reconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            feedback.className = 'text-xs text-center text-emerald-700 font-bold';
            feedback.innerText = data.message;
            setTimeout(() => {
                closeConfigModal();
                fetchSystemStatus();
                fetchCatalog();
            }, 1000);
        } else {
            feedback.className = 'text-xs text-center text-rose-600 font-semibold';
            feedback.innerText = `Connection Failed: ${data.error}`;
        }
    } catch (err) {
        feedback.className = 'text-xs text-center text-rose-600 font-semibold';
        feedback.innerText = `Error: ${err}`;
    }
}

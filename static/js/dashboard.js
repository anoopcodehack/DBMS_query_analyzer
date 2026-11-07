/**
 * QueryMetrics — Database Query Performance Analyzer & Optimization System
 * Dashboard Controller
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
});

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
// HIGHLIGHT NEXT SECTION (subtle flash on workbench)
// -----------------------------------------------------------------------------
function highlightNextSection() {
    const section = document.getElementById('workbenchSection');
    if (!section) return;

    section.classList.remove('flash-highlight');
    void section.offsetWidth;
    section.classList.add('flash-highlight');

    if (window.innerWidth < 1024) {
        section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// -----------------------------------------------------------------------------
// TAB SWITCHING
// -----------------------------------------------------------------------------
function switchTab(tabId) {
    const tabs = ['lab', 'catalog', 'procedure', 'view', 'audit'];
    tabs.forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        const btn = document.getElementById(`tabBtn-${t}`);
        const btnM = document.getElementById(`tabBtn-${t}-m`);
        if (el && btn) {
            if (t === tabId) {
                el.classList.remove('hidden');
                el.classList.remove('tab-enter');
                void el.offsetWidth;
                el.classList.add('tab-enter');
                btn.className = 'tab-link tab-active px-3 py-4 text-sm transition-colors';
                if (btnM) btnM.className = 'tab-link-m whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-blue-600 border-b-2 border-blue-600';
            } else {
                el.classList.add('hidden');
                btn.className = 'tab-link tab-inactive px-3 py-4 text-sm transition-colors';
                if (btnM) btnM.className = 'tab-link-m whitespace-nowrap px-3 py-2.5 text-xs font-medium text-gray-500 border-b-2 border-transparent';
            }
        }
    });

    if (tabId === 'procedure') fetchStoredProcedureHistory();
    if (tabId === 'view') fetchSummaryView();
    if (tabId === 'audit') fetchAuditLogs();
}

// -----------------------------------------------------------------------------
// SYSTEM STATUS & INDEX STATUS
// -----------------------------------------------------------------------------
async function fetchSystemStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();

        animateCounter('statRecordsCount', data.records_count || 0, 900);

        const text = document.getElementById('engineStatusText');
        if (text) {
            if (data.engine === 'MYSQL') {
                text.innerText = `MySQL 8.0 (${data.mysql_config?.database || 'Connected'})`;
            } else {
                text.innerText = `SQLite Engine`;
            }
        }

        const activeIdxNames = (data.active_indexes || []).map(i => i.name);

        // Status Index
        const statusBadge = document.getElementById('badge-status-idx');
        const statusBtn = document.getElementById('btn-status-idx');
        if (statusBadge && statusBtn) {
            if (activeIdxNames.includes('idx_demo_records_status')) {
                statusBadge.innerText = 'ACTIVE';
                statusBadge.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-semibold idx-active border';
                statusBtn.innerText = 'Drop Index';
                statusBtn.className = 'w-full py-1.5 text-xs font-semibold rounded-lg btn-secondary';
            } else {
                statusBadge.innerText = 'DISABLED';
                statusBadge.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-semibold idx-inactive border';
                statusBtn.innerText = 'Create Index';
                statusBtn.className = 'w-full py-1.5 text-xs font-semibold rounded-lg btn-primary';
            }
        }

        // Composite Index
        const compBadge = document.getElementById('badge-composite-idx');
        const compBtn = document.getElementById('btn-composite-idx');
        if (compBadge && compBtn) {
            if (activeIdxNames.includes('idx_demo_status_category')) {
                compBadge.innerText = 'ACTIVE';
                compBadge.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-semibold idx-active border';
                compBtn.innerText = 'Drop Index';
                compBtn.className = 'w-full py-1.5 text-xs font-semibold rounded-lg btn-secondary';
            } else {
                compBadge.innerText = 'DISABLED';
                compBadge.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-semibold idx-inactive border';
                compBtn.innerText = 'Create Index';
                compBtn.className = 'w-full py-1.5 text-xs font-semibold rounded-lg btn-primary';
            }
        }

    } catch (err) {
        console.error('Error fetching system status:', err);
    }
}

// -----------------------------------------------------------------------------
// QUERY CATALOG
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
                tr.className = "table-row-hover transition";
                tr.innerHTML = `
                    <td class="py-3 px-5 font-mono font-semibold text-gray-400">#${q.query_id}</td>
                    <td class="py-3 px-5">
                        <span class="font-semibold text-gray-900">${q.query_name}</span>
                        <span class="ml-2 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">${meta.category}</span>
                    </td>
                    <td class="py-3 px-5 font-mono text-gray-600 max-w-xs truncate text-xs">${q.query_sql}</td>
                    <td class="py-3 px-5 text-gray-500 text-xs">${q.description}</td>
                    <td class="py-3 px-5 text-right">
                        <button onclick="selectAndBenchmark(${q.query_id})" class="btn-primary px-3 py-1 text-xs font-semibold rounded-lg">
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
        highlightNextSection();
    }
}

function selectAndBenchmark(queryId) {
    document.getElementById('querySelect').value = queryId;
    onQuerySelected();
    switchTab('lab');
}

// -----------------------------------------------------------------------------
// AUTOMATED COMPARISON
// -----------------------------------------------------------------------------
async function runAutomatedComparison() {
    const queryId = document.getElementById('querySelect').value;
    const btn = document.getElementById('autoCompareBtn');
    const chartCard = document.getElementById('chartCard');
    if (!queryId) return;

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2 text-xs"></i><span>Comparing...</span>`;
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

        animateCounter('optimizedTime', o.elapsed_ms, 700, true, ' ms');

        const optMethodEl = document.getElementById('optimizedMethod');
        if (optMethodEl) optMethodEl.innerText = `ref (B-Tree)`;

        const badge = document.getElementById('speedupBadge');
        const text = document.getElementById('speedupText');
        if (badge && text) {
            badge.classList.remove('hidden');
            badge.classList.remove('pop-in');
            void badge.offsetWidth;
            badge.classList.add('pop-in');
            text.innerText = `${exp.speedup_pct}% Latency Drop`;
        }

        updateChart();

        const diagIo = document.getElementById('diagIoImpact');
        const diagForm = document.getElementById('diagFormula');
        if (diagIo) diagIo.innerText = exp.buffer_pool_note;
        if (diagForm) diagForm.innerText = `((T_base - T_opt) / T_base) * 100 = ${exp.speedup_pct}%`;

        const planText = o.plan?.explain_analyze || JSON.stringify(o.plan, null, 2);
        const expOutput = document.getElementById('explainOutput');
        if (expOutput) {
            expOutput.innerText = `=== OPTIMIZED EXECUTION PLAN (EXPLAIN ANALYZE) ===\n${planText}\n\n=== BASELINE EXECUTION PLAN (ALL FULL SCAN) ===\n${b.plan?.explain_analyze || JSON.stringify(b.plan, null, 2)}`;
        }

        highlightNextSection();
        await fetchSystemStatus();

    } catch (err) {
        console.error('Comparison failed:', err);
        alert('Comparative benchmark failed.');
    } finally {
        if (chartCard) chartCard.classList.remove('benchmarking-active');
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-arrows-left-right text-xs"></i><span>Compare</span>`;
    }
}

// -----------------------------------------------------------------------------
// SINGLE BENCHMARK
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
        runBtn.innerHTML = `<i class="fa-solid fa-play text-[10px]"></i><span>Run</span>`;
    }
}

// -----------------------------------------------------------------------------
// INDEX TOGGLER
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
    } catch (err) {
        console.error('Failed to toggle index:', err);
    }
}

// -----------------------------------------------------------------------------
// CHART.JS
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
                backgroundColor: ['#e5e7eb', '#2563eb'],
                borderColor: ['#d1d5db', '#1d4ed8'],
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 600, easing: 'easeOutQuart' },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#f3f4f6' },
                    ticks: { color: '#9ca3af', font: { family: 'JetBrains Mono, monospace', size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#374151', font: { weight: '500', size: 11, family: 'Inter, sans-serif' } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#111827',
                    titleColor: '#ffffff',
                    bodyColor: '#e5e7eb',
                    padding: 10,
                    cornerRadius: 8,
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
// STORED PROCEDURE EXPLORER
// -----------------------------------------------------------------------------
async function fetchStoredProcedureHistory() {
    const qid = document.getElementById('spQuerySelect')?.value || 1;
    const tableBody = document.getElementById('spTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-gray-400 text-xs"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Executing CALL GetBenchmarkHistory...</td></tr>';

    try {
        const res = await fetch(`/api/history/${qid}`);
        const rows = await res.json();
        tableBody.innerHTML = '';

        if (!rows || rows.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-gray-400 text-xs font-mono">No benchmark runs recorded yet for this query.</td></tr>';
            return;
        }

        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = "table-row-hover font-mono text-xs transition";
            tr.innerHTML = `
                <td class="py-3 px-5 font-semibold text-gray-400">#${r.result_id}</td>
                <td class="py-3 px-5 text-gray-500">Run #${r.run_id}</td>
                <td class="py-3 px-5 text-gray-900 font-sans font-semibold">${r.query_name}</td>
                <td class="py-3 px-5"><span class="px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 text-[10px] font-semibold">${r.test_label}</span></td>
                <td class="py-3 px-5 font-semibold text-gray-900">${r.elapsed_ms.toFixed(3)} ms</td>
                <td class="py-3 px-5 text-gray-600">${(r.rows_returned || 0).toLocaleString()}</td>
                <td class="py-3 px-5 text-gray-400">${r.recorded_at}</td>
            `;
            tableBody.appendChild(tr);
        });
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-red-500 text-xs font-mono">Failed: ${err}</td></tr>`;
    }
}

// -----------------------------------------------------------------------------
// DATABASE VIEW EXPLORER
// -----------------------------------------------------------------------------
async function fetchSummaryView() {
    const tableBody = document.getElementById('viewTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-gray-400 text-xs"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Querying BenchmarkSummary view...</td></tr>';

    try {
        const res = await fetch('/api/view/summary');
        const rows = await res.json();
        tableBody.innerHTML = '';

        if (!rows || rows.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-gray-400 text-xs font-mono">View contains 0 rows. Run a benchmark test in the Lab first.</td></tr>';
            return;
        }

        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = "table-row-hover font-mono text-xs transition";
            tr.innerHTML = `
                <td class="py-3 px-5 font-semibold text-gray-400">#${r.result_id}</td>
                <td class="py-3 px-5 text-gray-900 font-sans font-semibold">${r.query_name}</td>
                <td class="py-3 px-5"><span class="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">${r.status}</span></td>
                <td class="py-3 px-5 text-gray-600">${r.test_label}</td>
                <td class="py-3 px-5 font-semibold text-gray-900">${r.elapsed_ms.toFixed(3)} ms</td>
                <td class="py-3 px-5 text-gray-600">${(r.rows_returned || 0).toLocaleString()}</td>
                <td class="py-3 px-5 text-gray-400">${r.recorded_at}</td>
            `;
            tableBody.appendChild(tr);
        });
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-red-500 text-xs font-mono">Failed: ${err}</td></tr>`;
    }
}

// -----------------------------------------------------------------------------
// AUDIT TRAIL
// -----------------------------------------------------------------------------
async function fetchAuditLogs() {
    const tableBody = document.getElementById('auditTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-gray-400 text-xs"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Reading BenchmarkAudit table...</td></tr>';

    try {
        const res = await fetch('/api/audit');
        const rows = await res.json();
        tableBody.innerHTML = '';

        if (!rows || rows.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-gray-400 text-xs font-mono">No trigger audit logs registered yet.</td></tr>';
            return;
        }

        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = "table-row-hover text-xs transition";
            tr.innerHTML = `
                <td class="py-3 px-5 font-semibold text-gray-400">#${r.audit_id}</td>
                <td class="py-3 px-5 text-gray-500">Result #${r.result_id}</td>
                <td class="py-3 px-5"><span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">${r.event_type}</span></td>
                <td class="py-3 px-5 text-gray-400">${r.event_time}</td>
                <td class="py-3 px-5 text-gray-600 font-sans text-xs">${r.details}</td>
            `;
            tableBody.appendChild(tr);
        });
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-red-500 text-xs font-mono">Failed: ${err}</td></tr>`;
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
// CONFIG MODAL
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
    feedback.className = 'text-xs text-center text-gray-500';
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
            feedback.className = 'text-xs text-center text-emerald-600 font-semibold';
            feedback.innerText = data.message;
            setTimeout(() => {
                closeConfigModal();
                fetchSystemStatus();
                fetchCatalog();
            }, 1000);
        } else {
            feedback.className = 'text-xs text-center text-red-600 font-semibold';
            feedback.innerText = `Connection Failed: ${data.error}`;
        }
    } catch (err) {
        feedback.className = 'text-xs text-center text-red-600 font-semibold';
        feedback.innerText = `Error: ${err}`;
    }
}

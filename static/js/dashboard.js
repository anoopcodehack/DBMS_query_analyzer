/**
 * Database Query Performance Analyzer & Optimization System
 * Clean Developer Light Interface Controller & Benchmark Visualizer
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
// TAB SWITCHBOARD
// -----------------------------------------------------------------------------
function switchTab(tabId) {
    const tabs = ['lab', 'catalog', 'procedure', 'view', 'audit', 'viva'];
    tabs.forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        const btn = document.getElementById(`tabBtn-${t}`);
        if (el && btn) {
            if (t === tabId) {
                el.classList.remove('hidden');
                btn.className = 'tab-btn px-4 py-2 rounded-lg bg-blue-600 text-white flex items-center space-x-2 transition shadow-sm font-semibold text-xs';
            } else {
                el.classList.add('hidden');
                btn.className = 'tab-btn px-4 py-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center space-x-2 transition font-semibold text-xs';
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
        
        document.getElementById('statRecordsCount').innerText = (data.records_count || 0).toLocaleString();
        document.getElementById('statQueriesCount').innerText = data.total_queries || '0';
        document.getElementById('statRunsCount').innerText = data.total_runs || '0';
        document.getElementById('statActiveIndexes').innerText = data.active_indexes?.length || '0';

        // Engine Status Text
        const text = document.getElementById('engineStatusText');
        if (data.engine === 'MYSQL') {
            text.innerText = `MySQL 8.0 (${data.mysql_config?.database || 'Connected'})`;
        } else {
            text.innerText = `SQLite Engine (Zero-Config Testbed)`;
        }

        // Update Index experiment badges
        const activeIdxNames = (data.active_indexes || []).map(i => i.name);
        
        // Status Index
        const statusBadge = document.getElementById('badge-status-idx');
        const statusBtn = document.getElementById('btn-status-idx');
        if (activeIdxNames.includes('idx_demo_records_status')) {
            statusBadge.innerText = 'ACTIVE (INDEXED)';
            statusBadge.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200';
            statusBtn.innerText = 'Drop Index';
            statusBtn.className = 'w-full py-1.5 text-xs font-semibold rounded bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 transition shadow-xs';
        } else {
            statusBadge.innerText = 'DISABLED (FULL SCAN)';
            statusBadge.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-medium bg-slate-100 text-slate-600 border border-slate-200';
            statusBtn.innerText = 'Create Index';
            statusBtn.className = 'w-full py-1.5 text-xs font-bold rounded bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm';
        }

        // Composite Index
        const compBadge = document.getElementById('badge-composite-idx');
        const compBtn = document.getElementById('btn-composite-idx');
        if (activeIdxNames.includes('idx_demo_status_category')) {
            compBadge.innerText = 'ACTIVE (INDEXED)';
            compBadge.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200';
            compBtn.innerText = 'Drop Index';
            compBtn.className = 'w-full py-1.5 text-xs font-semibold rounded bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 transition shadow-xs';
        } else {
            compBadge.innerText = 'DISABLED (FULL SCAN)';
            compBadge.className = 'text-[10px] px-2 py-0.5 rounded font-mono font-medium bg-slate-100 text-slate-600 border border-slate-200';
            compBtn.innerText = 'Create Index';
            compBtn.className = 'w-full py-1.5 text-xs font-bold rounded bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm';
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
        
        select.innerHTML = '';
        spSelect.innerHTML = '';
        tableBody.innerHTML = '';

        catalogData.forEach(q => {
            const opt = document.createElement('option');
            opt.value = q.query_id;
            opt.innerText = `Q${q.query_id}: ${q.query_name}`;
            select.appendChild(opt);

            const spOpt = document.createElement('option');
            spOpt.value = q.query_id;
            spOpt.innerText = `Q${q.query_id}: ${q.query_name}`;
            spSelect.appendChild(spOpt);

            const meta = WORKLOAD_DESCRIPTIONS[q.query_id] || { category: "GENERAL", explanation: q.description };

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition border-b border-slate-100";
            tr.innerHTML = `
                <td class="py-2.5 px-3 font-mono font-bold text-slate-500">#${q.query_id}</td>
                <td class="py-2.5 px-3 font-bold text-slate-900">
                    ${q.query_name}
                    <div class="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-mono mt-0.5 font-bold inline-block">${meta.category}</div>
                </td>
                <td class="py-2.5 px-3 font-mono text-slate-700 max-w-xs truncate">${q.query_sql}</td>
                <td class="py-2.5 px-3 text-slate-600 font-sans text-xs">${q.description}</td>
                <td class="py-2.5 px-3 text-right">
                    <button onclick="selectAndBenchmark(${q.query_id})" class="px-3 py-1 text-xs font-bold rounded bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm">
                        Select
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
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
    }
}

function selectAndBenchmark(queryId) {
    document.getElementById('querySelect').value = queryId;
    onQuerySelected();
    switchTab('lab');
}

// -----------------------------------------------------------------------------
// 1-CLICK AUTOMATED COMPARISON (Core Lab Demo)
// -----------------------------------------------------------------------------
async function runAutomatedComparison() {
    const queryId = document.getElementById('querySelect').value;
    const btn = document.getElementById('autoCompareBtn');
    if (!queryId) return;

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Evaluating Baseline & Indexed Plans...</span>`;

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

        document.getElementById('baselineTime').innerText = `${b.elapsed_ms.toFixed(2)} ms`;
        document.getElementById('baselineMethod').innerText = b.access_type;
        document.getElementById('baselineRows').innerText = (b.rows_returned || 0).toLocaleString();

        document.getElementById('optimizedTime').innerText = `${o.elapsed_ms.toFixed(2)} ms`;
        document.getElementById('optimizedMethod').innerText = o.access_type;
        document.getElementById('optimizedRows').innerText = (o.rows_returned || 0).toLocaleString();

        // Speedup Badge
        const badge = document.getElementById('speedupBadge');
        const text = document.getElementById('speedupText');
        badge.classList.remove('hidden');
        text.innerText = `${exp.speedup_pct}% Latency Reduction!`;

        // Update Chart
        updateChart();

        // Update Explanation
        document.getElementById('diagAccessPath').innerText = exp.io_impact;
        document.getElementById('diagIoImpact').innerText = exp.buffer_pool_note;
        document.getElementById('diagFormula').innerText = exp.formula;

        // Execution Plan Output
        const planText = o.plan?.explain_analyze || JSON.stringify(o.plan, null, 2);
        document.getElementById('explainOutput').innerText = `=== OPTIMIZED EXECUTION PLAN (EXPLAIN ANALYZE) ===\n${planText}\n\n=== BASELINE EXECUTION PLAN (ALL FULL SCAN) ===\n${b.plan?.explain_analyze || JSON.stringify(b.plan, null, 2)}`;

        await fetchSystemStatus();

    } catch (err) {
        console.error('Comparison failed:', err);
        alert('Comparative benchmark failed.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-bolt text-xs"></i> <span>Run Automated Comparison</span>`;
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

    if (!queryId) return;

    runBtn.disabled = true;
    runBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Sampling (${reps}x)...</span>`;

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
            document.getElementById('baselineTime').innerText = `${avgMs.toFixed(2)} ms`;
            document.getElementById('baselineMethod').innerText = scanType;
            document.getElementById('baselineRows').innerText = rows.toLocaleString();
            document.getElementById('testLabelInput').value = 'OPTIMIZED_INDEX';
        } else {
            lastOptimized = { ms: avgMs, scanType: scanType, rows: rows, label: testLabel };
            document.getElementById('optimizedTime').innerText = `${avgMs.toFixed(2)} ms`;
            document.getElementById('optimizedMethod').innerText = scanType;
            document.getElementById('optimizedRows').innerText = rows.toLocaleString();
            document.getElementById('testLabelInput').value = 'BASELINE_SCAN';
        }

        if (lastBaseline && lastOptimized) {
            const b = lastBaseline.ms;
            const o = lastOptimized.ms;
            if (b > 0) {
                const pct = (((b - o) / b) * 100).toFixed(1);
                const badge = document.getElementById('speedupBadge');
                const text = document.getElementById('speedupText');
                badge.classList.remove('hidden');
                text.innerText = `${pct}% Latency Reduction!`;
                document.getElementById('diagFormula').innerText = `Improvement (%) = ((${b} - ${o}) / ${b}) * 100 = ${pct}%`;
            }
        }

        updateChart();

        const explainOutput = document.getElementById('explainOutput');
        if (plan.explain_analyze) {
            explainOutput.innerText = plan.explain_analyze;
        } else {
            explainOutput.innerText = JSON.stringify(plan, null, 2);
        }

        await fetchSystemStatus();

    } catch (err) {
        console.error('Execution failed:', err);
    } finally {
        runBtn.disabled = false;
        runBtn.innerHTML = `<i class="fa-solid fa-play text-xs"></i> <span>Execute Single Test</span>`;
    }
}

// -----------------------------------------------------------------------------
// INDEX EXPERIMENT TOGGLER
// -----------------------------------------------------------------------------
async function toggleIndex(indexName) {
    const statusBadge = indexName === 'idx_demo_records_status' 
        ? document.getElementById('badge-status-idx') 
        : document.getElementById('badge-composite-idx');
        
    const isCurrentlyActive = statusBadge.innerText.includes('ACTIVE');
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
// CLEAN LIGHT PALETTE CHART.JS CONTROLLER (Slate & Royal Blue)
// -----------------------------------------------------------------------------
function initChart() {
    const ctx = document.getElementById('comparisonChart').getContext('2d');
    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Baseline (No Index)', 'Optimized (B-Tree Indexed)'],
            datasets: [{
                label: 'Query Latency (ms)',
                data: [0, 0],
                backgroundColor: [
                    '#94a3b8',   // Slate-400 (Baseline Full Table Scan)
                    '#2563eb'    // Royal Blue (Optimized B-Tree Index Scan)
                ],
                borderColor: [
                    '#64748b',   // Slate-500
                    '#1d4ed8'    // Blue-700
                ],
                borderWidth: 1.5,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(226, 232, 240, 0.8)' },
                    ticks: { color: '#64748b', font: { family: 'Geist Mono, monospace', size: 10 } },
                    title: { display: true, text: 'Latency (ms)', color: '#475569', font: { size: 11, weight: '600' } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#0f172a', font: { weight: '600', size: 11 } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#ffffff',
                    bodyColor: '#f8fafc',
                    borderColor: '#e2e8f0',
                    borderWidth: 1,
                    padding: 10,
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
    const qid = document.getElementById('spQuerySelect').value || 1;
    const tableBody = document.getElementById('spTableBody');
    tableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-slate-400 font-mono"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Executing CALL GetBenchmarkHistory...</td></tr>';

    try {
        const res = await fetch(`/api/history/${qid}`);
        const rows = await res.json();
        tableBody.innerHTML = '';

        if (!rows || rows.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-slate-500 font-mono">No benchmark runs recorded yet for this query.</td></tr>';
            return;
        }

        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 font-mono text-[11px] transition border-b border-slate-100";
            tr.innerHTML = `
                <td class="py-2.5 px-3 font-bold text-slate-500">#${r.result_id}</td>
                <td class="py-2.5 px-3 text-slate-600">Run #${r.run_id}</td>
                <td class="py-2.5 px-3 text-slate-900 font-sans font-semibold">${r.query_name}</td>
                <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">${r.test_label}</span></td>
                <td class="py-2.5 px-3 font-bold text-slate-900">${r.elapsed_ms.toFixed(3)} ms</td>
                <td class="py-2.5 px-3 text-slate-700">${(r.rows_returned || 0).toLocaleString()}</td>
                <td class="py-2.5 px-3 text-slate-500">${r.recorded_at}</td>
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
    tableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-slate-400 font-mono"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Querying View BenchmarkSummary...</td></tr>';

    try {
        const res = await fetch('/api/view/summary');
        const rows = await res.json();
        tableBody.innerHTML = '';

        if (!rows || rows.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-slate-500 font-mono">View contains 0 rows. Run a benchmark test in the Lab first.</td></tr>';
            return;
        }

        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 font-mono text-[11px] transition border-b border-slate-100";
            tr.innerHTML = `
                <td class="py-2.5 px-3 font-bold text-slate-500">#${r.result_id}</td>
                <td class="py-2.5 px-3 text-slate-900 font-sans font-semibold">${r.query_name}</td>
                <td class="py-2.5 px-3"><span class="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">${r.status}</span></td>
                <td class="py-2.5 px-3 text-slate-700">${r.test_label}</td>
                <td class="py-2.5 px-3 font-bold text-slate-900">${r.elapsed_ms.toFixed(3)} ms</td>
                <td class="py-2.5 px-3 text-slate-700">${(r.rows_returned || 0).toLocaleString()}</td>
                <td class="py-2.5 px-3 text-slate-500">${r.recorded_at}</td>
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
    tableBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-slate-400 font-mono"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Reading BenchmarkAudit table...</td></tr>';

    try {
        const res = await fetch('/api/audit');
        const rows = await res.json();
        tableBody.innerHTML = '';

        if (!rows || rows.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-slate-500 font-mono">No trigger audit logs registered yet.</td></tr>';
            return;
        }

        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 font-mono text-[11px] transition border-b border-slate-100";
            tr.innerHTML = `
                <td class="py-2.5 px-3 font-bold text-slate-500">#${r.audit_id}</td>
                <td class="py-2.5 px-3 text-slate-600">Result #${r.result_id}</td>
                <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">${r.event_type}</span></td>
                <td class="py-2.5 px-3 text-slate-500">${r.event_time}</td>
                <td class="py-2.5 px-3 text-slate-700 font-sans text-xs">${r.details}</td>
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
    feedback.className = 'text-xs text-center text-slate-500';
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
            feedback.className = 'text-xs text-center text-emerald-600 font-bold';
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

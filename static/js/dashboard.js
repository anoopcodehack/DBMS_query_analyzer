/**
 * Database Query Performance Analyzer & Optimization System
 * Frontend Controller & Chart.js Visualizer
 */

let catalogData = [];
let comparisonChart = null;
let lastBaseline = null;
let lastOptimized = null;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initChart();
    fetchSystemStatus();
    fetchCatalog();
});

// -----------------------------------------------------------------------------
// THEME CONTROLLER
// -----------------------------------------------------------------------------
function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        document.getElementById('themeIcon').classList.replace('fa-moon', 'fa-sun');
    } else {
        document.documentElement.classList.remove('dark');
        document.getElementById('themeIcon').classList.replace('fa-sun', 'fa-moon');
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    const icon = document.getElementById('themeIcon');
    if (isDark) {
        icon.classList.replace('fa-moon', 'fa-sun');
    } else {
        icon.classList.replace('fa-sun', 'fa-moon');
    }
    if (comparisonChart) {
        comparisonChart.update();
    }
}

// -----------------------------------------------------------------------------
// TAB SWITCHER
// -----------------------------------------------------------------------------
function switchTab(tabId) {
    const tabs = ['lab', 'catalog', 'procedure', 'view', 'audit', 'viva'];
    tabs.forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        const btn = document.getElementById(`tabBtn-${t}`);
        if (el && btn) {
            if (t === tabId) {
                el.classList.remove('hidden');
                btn.className = 'tab-btn px-4 py-2 rounded-xl bg-brand-600 text-white flex items-center space-x-2 font-semibold text-sm';
            } else {
                el.classList.add('hidden');
                btn.className = 'tab-btn px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center space-x-2 font-semibold text-sm';
            }
        }
    });

    if (tabId === 'procedure') fetchStoredProcedureHistory();
    if (tabId === 'view') fetchSummaryView();
    if (tabId === 'audit') fetchAuditLogs();
}

// -----------------------------------------------------------------------------
// SYSTEM STATUS & METRICS
// -----------------------------------------------------------------------------
async function fetchSystemStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        // Update stats
        document.getElementById('statRecordsCount').innerText = data.records_count?.toLocaleString() || '0';
        document.getElementById('statQueriesCount').innerText = data.total_queries || '0';
        document.getElementById('statRunsCount').innerText = data.total_runs || '0';
        document.getElementById('statActiveIndexes').innerText = data.active_indexes?.length || '0';

        // Update Engine Status Pill
        const pill = document.getElementById('engineStatusPill');
        const text = document.getElementById('engineStatusText');
        if (data.engine === 'MYSQL') {
            text.innerText = `MySQL 8.0 (${data.mysql_config?.database || 'Connected'})`;
            pill.className = "flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 cursor-pointer";
        } else {
            text.innerText = `SQLite Engine (Zero-Config Mode)`;
            pill.className = "flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800 cursor-pointer";
        }

        // Update Index experiment badges
        const activeIdxNames = (data.active_indexes || []).map(i => i.name);
        
        // Status Index
        const statusBadge = document.getElementById('badge-status-idx');
        const statusBtn = document.getElementById('btn-status-idx');
        if (activeIdxNames.includes('idx_demo_records_status')) {
            statusBadge.innerText = 'ACTIVE (INDEXED)';
            statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300';
            statusBtn.innerText = 'Drop Index';
            statusBtn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg transition bg-rose-600 hover:bg-rose-700 text-white';
        } else {
            statusBadge.innerText = 'INACTIVE (FULL SCAN)';
            statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
            statusBtn.innerText = 'Create Index';
            statusBtn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg transition bg-brand-600 hover:bg-brand-700 text-white';
        }

        // Composite Index
        const compBadge = document.getElementById('badge-composite-idx');
        const compBtn = document.getElementById('btn-composite-idx');
        if (activeIdxNames.includes('idx_demo_status_category')) {
            compBadge.innerText = 'ACTIVE (INDEXED)';
            compBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300';
            compBtn.innerText = 'Drop Index';
            compBtn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg transition bg-rose-600 hover:bg-rose-700 text-white';
        } else {
            compBadge.innerText = 'INACTIVE (FULL SCAN)';
            compBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
            compBtn.innerText = 'Create Index';
            compBtn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg transition bg-brand-600 hover:bg-brand-700 text-white';
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
        
        select.innerHTML = '';
        spSelect.innerHTML = '';
        tableBody.innerHTML = '';

        catalogData.forEach((q, idx) => {
            // Dropdown options
            const opt = document.createElement('option');
            opt.value = q.query_id;
            opt.innerText = `Q${q.query_id}: ${q.query_name}`;
            select.appendChild(opt);

            const spOpt = document.createElement('option');
            spOpt.value = q.query_id;
            spOpt.innerText = `Q${q.query_id}: ${q.query_name}`;
            spSelect.appendChild(spOpt);

            // Catalog Table Row
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/50 transition";
            tr.innerHTML = `
                <td class="py-3 px-4 font-bold text-slate-500">${q.query_id}</td>
                <td class="py-3 px-4 font-bold text-slate-900 dark:text-white">${q.query_name}</td>
                <td class="py-3 px-4 text-emerald-600 dark:text-emerald-400 max-w-xs truncate">${q.query_sql}</td>
                <td class="py-3 px-4 text-slate-500 font-sans">${q.description}</td>
                <td class="py-3 px-4 text-right">
                    <button onclick="selectAndBenchmark(${q.query_id})" class="px-2.5 py-1 text-[11px] font-bold rounded bg-brand-600 text-white hover:bg-brand-700">
                        Select
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        if (catalogData.length > 0) {
            onQuerySelected();
        }
    } catch (err) {
        console.error('Failed to load query catalog:', err);
    }
}

function onQuerySelected() {
    const qid = parseInt(document.getElementById('querySelect').value);
    const item = catalogData.find(q => q.query_id === qid);
    if (item) {
        document.getElementById('querySqlDisplay').innerText = item.query_sql;
        document.getElementById('queryDescDisplay').innerText = item.description;
    }
}

function selectAndBenchmark(queryId) {
    document.getElementById('querySelect').value = queryId;
    onQuerySelected();
    switchTab('lab');
}

// -----------------------------------------------------------------------------
// BENCHMARK EXECUTION & MEASUREMENT
// -----------------------------------------------------------------------------
async function runBenchmark() {
    const queryId = document.getElementById('querySelect').value;
    const testLabel = document.getElementById('testLabelInput').value.trim() || 'BENCHMARK_RUN';
    const reps = parseInt(document.getElementById('repsSelect').value) || 1;
    const runBtn = document.getElementById('runBtn');

    if (!queryId) return;

    runBtn.disabled = true;
    runBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Executing Test (${reps} Repetitions)...</span>`;

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
            alert(`Benchmark Error: ${result.error}`);
            return;
        }

        const avgMs = result.average_elapsed_ms;
        const plan = result.latest_result?.plan || {};
        const rows = result.latest_result?.rows_returned || 0;

        // Determine scan type from tabular plan or explain output
        let scanType = 'ALL (Full Table Scan)';
        if (plan.tabular_plan) {
            const planStr = JSON.stringify(plan.tabular_plan);
            if (planStr.includes('ref') || planStr.includes('eq_ref') || planStr.includes('SEARCH TABLE')) {
                scanType = 'ref (B-Tree Index Scan)';
            }
        }

        // Logic for Baseline vs Optimized state tracking
        if (testLabel.toUpperCase().includes('BASE') || !lastBaseline) {
            lastBaseline = { ms: avgMs, scanType: scanType, rows: rows, label: testLabel };
            document.getElementById('baselineTime').innerText = `${avgMs} ms`;
            document.getElementById('baselineMethod').innerText = scanType;
            document.getElementById('baselineRows').innerText = rows.toLocaleString();
            document.getElementById('testLabelInput').value = 'OPTIMIZED_INDEX_RUN';
        } else {
            lastOptimized = { ms: avgMs, scanType: scanType, rows: rows, label: testLabel };
            document.getElementById('optimizedTime').innerText = `${avgMs} ms`;
            document.getElementById('optimizedMethod').innerText = scanType;
            document.getElementById('optimizedRows').innerText = rows.toLocaleString();
            document.getElementById('testLabelInput').value = 'BASELINE_RUN';
        }

        // Calculate speedup if both are available
        if (lastBaseline && lastOptimized) {
            const b = lastBaseline.ms;
            const o = lastOptimized.ms;
            if (b > 0) {
                const pct = (((b - o) / b) * 100).toFixed(1);
                const badge = document.getElementById('speedupBadge');
                const text = document.getElementById('speedupText');
                badge.classList.remove('hidden');
                if (pct > 0) {
                    text.innerText = `${pct}% Performance Speedup! 🚀`;
                    badge.className = 'px-4 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-sm border border-emerald-300 dark:border-emerald-700 flex items-center space-x-2';
                } else {
                    text.innerText = `${Math.abs(pct)}% Timing Difference`;
                    badge.className = 'px-4 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm flex items-center space-x-2';
                }
            }
        }

        // Update Chart
        updateChart();

        // Update EXPLAIN ANALYZE display
        const explainOutput = document.getElementById('explainOutput');
        if (plan.explain_analyze) {
            explainOutput.innerText = plan.explain_analyze;
        } else if (plan.json_plan) {
            explainOutput.innerText = JSON.stringify(plan.json_plan, null, 2);
        } else if (plan.tabular_plan) {
            explainOutput.innerText = JSON.stringify(plan.tabular_plan, null, 2);
        }

        // Refresh stats
        fetchSystemStatus();

    } catch (err) {
        console.error('Benchmark execution failed:', err);
        alert('Failed to execute benchmark. Check server console.');
    } finally {
        runBtn.disabled = false;
        runBtn.innerHTML = `<i class="fa-solid fa-play"></i> <span>Execute Benchmark</span>`;
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
            body: JSON.stringify({
                index_name: indexName,
                action: targetAction
            })
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
// CHART.JS INITIALIZATION & UPDATE
// -----------------------------------------------------------------------------
function initChart() {
    const ctx = document.getElementById('comparisonChart').getContext('2d');
    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Baseline (No Index)', 'Optimized (Indexed)'],
            datasets: [{
                label: 'Execution Time (ms)',
                data: [0, 0],
                backgroundColor: [
                    'rgba(239, 68, 68, 0.8)',   // Red for unindexed full table scan
                    'rgba(16, 185, 129, 0.8)'   // Green for indexed scan
                ],
                borderColor: [
                    'rgb(239, 68, 68)',
                    'rgb(16, 185, 129)'
                ],
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Elapsed Duration (ms)'
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.raw} ms`
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
    tableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Invoking Stored Procedure...</td></tr>';

    try {
        const res = await fetch(`/api/history/${qid}`);
        const rows = await res.json();
        tableBody.innerHTML = '';

        if (!rows || rows.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-slate-400">No benchmark runs recorded yet for this query.</td></tr>';
            return;
        }

        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/50";
            tr.innerHTML = `
                <td class="py-2.5 px-3 font-mono font-bold">${r.result_id}</td>
                <td class="py-2.5 px-3 font-mono text-slate-500">${r.run_id}</td>
                <td class="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">${r.query_name}</td>
                <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded font-mono text-[10px] bg-slate-100 dark:bg-slate-800">${r.test_label}</span></td>
                <td class="py-2.5 px-3 font-mono font-bold ${r.elapsed_ms < 10 ? 'text-emerald-500' : 'text-amber-500'}">${r.elapsed_ms.toFixed(3)} ms</td>
                <td class="py-2.5 px-3 font-mono text-slate-500">${r.rows_returned.toLocaleString()}</td>
                <td class="py-2.5 px-3 text-slate-400">${r.recorded_at}</td>
            `;
            tableBody.appendChild(tr);
        });
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-rose-500">Failed to execute stored procedure: ${err}</td></tr>`;
    }
}

// -----------------------------------------------------------------------------
// DATABASE VIEW EXPLORER (`BenchmarkSummary`)
// -----------------------------------------------------------------------------
async function fetchSummaryView() {
    const tableBody = document.getElementById('viewTableBody');
    tableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Querying Database View...</td></tr>';

    try {
        const res = await fetch('/api/view/summary');
        const rows = await res.json();
        tableBody.innerHTML = '';

        if (!rows || rows.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-slate-400">View contains 0 records. Execute some benchmarks in Lab tab first.</td></tr>';
            return;
        }

        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/50";
            tr.innerHTML = `
                <td class="py-2.5 px-3 font-mono font-bold">${r.result_id}</td>
                <td class="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">${r.query_name}</td>
                <td class="py-2.5 px-3"><span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">${r.status}</span></td>
                <td class="py-2.5 px-3 font-mono text-[10px]">${r.test_label}</td>
                <td class="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">${r.elapsed_ms.toFixed(3)} ms</td>
                <td class="py-2.5 px-3 font-mono text-slate-500">${r.rows_returned.toLocaleString()}</td>
                <td class="py-2.5 px-3 text-slate-400">${r.recorded_at}</td>
            `;
            tableBody.appendChild(tr);
        });
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-rose-500">Failed to query view: ${err}</td></tr>`;
    }
}

// -----------------------------------------------------------------------------
// TRIGGER AUDIT TRAIL (`BenchmarkAudit`)
// -----------------------------------------------------------------------------
async function fetchAuditLogs() {
    const tableBody = document.getElementById('auditTableBody');
    tableBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading Trigger Audit Logs...</td></tr>';

    try {
        const res = await fetch('/api/audit');
        const rows = await res.json();
        tableBody.innerHTML = '';

        if (!rows || rows.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-slate-400">No trigger audit logs recorded yet.</td></tr>';
            return;
        }

        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/50";
            tr.innerHTML = `
                <td class="py-2.5 px-3 font-bold text-slate-500">#${r.audit_id}</td>
                <td class="py-2.5 px-3 text-slate-400">Result #${r.result_id}</td>
                <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">${r.event_type}</span></td>
                <td class="py-2.5 px-3 text-slate-400">${r.event_time}</td>
                <td class="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-sans">${r.details}</td>
            `;
            tableBody.appendChild(tr);
        });
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-rose-500">Failed to fetch audit: ${err}</td></tr>`;
    }
}

// -----------------------------------------------------------------------------
// DATASET SEEDING
// -----------------------------------------------------------------------------
async function seedAdditionalRows(count) {
    if (!confirm(`Generate ${count.toLocaleString()} additional realistic records into DemoRecords?`)) return;
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
// CONFIG MODAL (MySQL Connection settings)
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
    feedback.innerText = 'Testing connection to MySQL server...';

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
            }, 1200);
        } else {
            feedback.className = 'text-xs text-center text-rose-500 font-semibold';
            feedback.innerText = `Connection Failed: ${data.error}`;
        }
    } catch (err) {
        feedback.className = 'text-xs text-center text-rose-500 font-semibold';
        feedback.innerText = `Error: ${err}`;
    }
}

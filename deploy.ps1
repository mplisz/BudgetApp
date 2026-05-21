# ============================================================
# deploy.ps1 — deploy downloaded files to correct locations
#              and remove replaced .jsx / .js files
# Run from: C:\Projekty\BudgetApp\
#   .\deploy.ps1
#   .\deploy.ps1 -DryRun
# ============================================================

param([switch]$DryRun)

$downloads = "C:\Users\48660\Downloads"
$src       = "frontend\src"

if ($DryRun) { Write-Host "DRY RUN`n" -ForegroundColor Yellow }

# ── File map: Downloads filename => destination path ──────────
$deploy = @{
    # Hooks
    "usePlanned.ts"          = "$src\hooks\usePlanned.ts"
    "useLimits.ts"           = "$src\hooks\useLimits.ts"
    "useVouchers.ts"         = "$src\hooks\useVouchers.ts"
    "useDiscount.ts"         = "$src\hooks\useDiscount.ts"

    # Layout
    "NotificationBell.tsx"   = "$src\components\layout\NotificationBell.tsx"
    "MonthNavigator.tsx"     = "$src\components\layout\MonthNavigator.tsx"

    # UI
    "BudgetInput.tsx"        = "$src\components\ui\BudgetInput.tsx"

    # Types
    "transactionTypes.ts"    = "$src\types\transaction.ts"

    # Panels
    "PanelExpenses.tsx"      = "$src\components\panels\PanelExpenses.tsx"
    "PanelBaseBudget.tsx"    = "$src\components\panels\PanelBaseBudget.tsx"
    "PanelSummary.tsx"       = "$src\components\panels\PanelSummary.tsx"
    "PanelAddIncome.tsx"     = "$src\components\panels\PanelAddIncome.tsx"
    "PanelPlanned.tsx"       = "$src\components\panels\PanelPlanned.tsx"
    "PanelAddPlanned.tsx"    = "$src\components\panels\PanelAddPlanned.tsx"

    # transactionComponents
    "TransactionForm.tsx"    = "$src\components\panels\transactionComponents\TransactionForm.tsx"
    "CartPanel.tsx"          = "$src\components\panels\transactionComponents\CartPanel.tsx"
    "IncomeForm.tsx"         = "$src\components\panels\transactionComponents\IncomeForm.tsx"
    "IncomeEntryCard.tsx"    = "$src\components\panels\transactionComponents\IncomeEntryCard.tsx"
    "EditIncomeModal.tsx"    = "$src\components\panels\transactionComponents\EditIncomeModal.tsx"
    "CollapsibleToggle.tsx"  = "$src\components\panels\transactionComponents\CollapsibleToggle.tsx"
    "VoucherSection.tsx"     = "$src\components\panels\transactionComponents\VoucherSection.tsx"

    # plannedComponents
    "PlannedForm.tsx"        = "$src\components\panels\plannedComponents\PlannedForm.tsx"
    "PlannedCard.tsx"        = "$src\components\panels\plannedComponents\PlannedCard.tsx"

    # summaryComponents
    "CategoryLimitBar.tsx"   = "$src\components\panels\summaryComponents\CategoryLimitBar.tsx"
    "TargetIndicator.tsx"    = "$src\components\panels\summaryComponents\TargetIndicator.tsx"
    "PriorityBreakdown.tsx"  = "$src\components\panels\summaryComponents\PriorityBreakdown.tsx"
    "SpendingPieChart.tsx"   = "$src\components\panels\summaryComponents\SpendingPieChart.tsx"
    "TopTransactions.tsx"    = "$src\components\panels\summaryComponents\TopTransactions.tsx"
    "SavingsSummary.tsx"     = "$src\components\panels\summaryComponents\SavingsSummary.tsx"

    # Backend
    "limits_batch_route.js"  = "backend\routes\limits_batch_route.js"
    "seed_transactions.js"   = "BuddetApp DB\seed_transactions.js"
    "seed-limits.js"         = "BuddetApp DB\seed-limits.js"

    "PanelTransactions.tsx"  = "$src\components\panels\PanelTransactions.tsx"

}

# ── Old files to delete after deploy ─────────────────────────
$toDelete = @(
    "$src\hooks\usePlanned.js"
    "$src\hooks\useLimits.js"
    "$src\hooks\useVouchers.js"
    "$src\hooks\useDiscount.js"
    "$src\components\layout\NotificationBell.jsx"
    "$src\components\layout\MonthNavigator.jsx"
    "$src\components\ui\BudgetInput.jsx"
    "$src\components\panels\PanelExpenses.jsx"
    "$src\components\panels\PanelBaseBudget.jsx"
    "$src\components\panels\PanelSummary.jsx"
    "$src\components\panels\PanelAddIncome.jsx"
    "$src\components\panels\PanelPlanned.jsx"
    "$src\components\panels\PanelAddPlanned.jsx"
    "$src\components\panels\CartPanel.jsx"
    "$src\components\panels\IncomeEntryCard.jsx"
    "$src\components\panels\IncomeEntryForm.jsx"
    "$src\components\panels\transactionComponents\TransactionForm.jsx"
    "$src\components\panels\transactionComponents\CartPanel.jsx"
    "$src\components\panels\transactionComponents\IncomeForm.jsx"
    "$src\components\panels\transactionComponents\IncomeEntryCard.jsx"
    "$src\components\panels\transactionComponents\EditIncomeModal.jsx"
    "$src\components\panels\transactionComponents\CollapsibleToggle.jsx"
    "$src\components\panels\transactionComponents\VoucherSection.jsx"
    "$src\components\panels\plannedComponents\PlannedForm.jsx"
    "$src\components\panels\plannedComponents\PlannedCard.jsx"

    "$src\components\panels\PanelTransactions.jsx"

)

$copied  = 0
$skipped = 0
$deleted = 0

# ── Deploy ────────────────────────────────────────────────────
Write-Host "DEPLOY" -ForegroundColor Cyan
foreach ($file in $deploy.Keys) {
    $src_file  = Join-Path $downloads $file
    $dest_file = $deploy[$file]
    $dest_dir  = Split-Path $dest_file

    if (Test-Path $src_file) {
        if ($DryRun) {
            Write-Host ('  would copy: ' + $file + ' -> ' + $dest_file) -ForegroundColor Cyan
        } else {
            if (-not (Test-Path $dest_dir)) { New-Item -ItemType Directory -Path $dest_dir -Force | Out-Null }
            Copy-Item $src_file $dest_file -Force
            Write-Host ('  copied: ' + $file) -ForegroundColor Green
        }
        $copied++
    } else {
        Write-Host ('  not in Downloads (skip): ' + $file) -ForegroundColor DarkGray
        $skipped++
    }
}

# ── Delete old files ──────────────────────────────────────────
Write-Host "`nDELETE OLD FILES" -ForegroundColor Cyan
foreach ($file in $toDelete) {
    if (Test-Path $file) {
        if ($DryRun) {
            Write-Host ('  would delete: ' + $file) -ForegroundColor Yellow
        } else {
            Remove-Item $file -Force
            Write-Host ('  deleted: ' + $file) -ForegroundColor Red
        }
        $deleted++
    }
}

# ── Summary ───────────────────────────────────────────────────
Write-Host ""
if ($DryRun) {
    Write-Host ('DRY RUN: ' + $copied + ' would copy, ' + $skipped + ' not found, ' + $deleted + ' would delete') -ForegroundColor Yellow
} else {
    Write-Host ('Done: ' + $copied + ' copied, ' + $skipped + ' not in Downloads, ' + $deleted + ' deleted') -ForegroundColor Green
}

const pool = require("../db");

// Số ngày ân hạn sau ngày bắt đầu kỳ, trước khi hóa đơn bị coi là quá hạn
const GRACE_DAYS = 5;

// Toàn bộ tính toán ngày dưới đây dùng các hàm UTC (getUTCFullYear, setUTCDate...)
// thay vì hàm local (getMonth, setDate...) để kết quả không phụ thuộc vào
// timezone của máy chủ Node đang chạy (nếu server không đặt TZ=Asia/Ho_Chi_Minh,
// dùng hàm local có thể làm lệch ngày +/-1 ngày ở các mốc gần nửa đêm).

function addMonths(date, n) {
    const d = new Date(date);
    d.setUTCMonth(d.getUTCMonth() + n);
    return d;
}

function addDays(date, n) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
}

function toISODate(date) {
    return date.toISOString().slice(0, 10);
}

function monthsBetween(d1, d2) {
    const months =
        (d2.getUTCFullYear() - d1.getUTCFullYear()) * 12 +
        (d2.getUTCMonth() - d1.getUTCMonth());
    return Math.max(1, months);
}

/**
 * Tính danh sách các kỳ thanh toán đã "tới hạn phát sinh" của 1 hợp đồng,
 * tức period_start <= hôm nay (không quan tâm hóa đơn đã tồn tại hay chưa,
 * việc đó do generateDueInvoices() xử lý).
 */
function buildDuePeriods(contract, today) {
    const { start_date, end_date, monthly_rent, payment_step_months } = contract;

    if (!start_date || !end_date || !monthly_rent) return [];

    const step = Number(payment_step_months) || 1;
    const start = new Date(start_date);
    const end = new Date(end_date);
    const rent = Number(monthly_rent);

    const periods = [];
    let current = new Date(start);
    let period = 1;

    while (current < end && current <= today) {
        const next = addMonths(current, step);
        const periodEndDate = new Date(next > end ? end : next);
        periodEndDate.setUTCDate(periodEndDate.getUTCDate() - 1);

        const monthsDiff = monthsBetween(current, next > end ? end : next);
        const amount = Math.round(rent * monthsDiff);
        const dueDate = addDays(current, GRACE_DAYS);

        periods.push({
            period,
            period_start: toISODate(current),
            period_end: toISODate(periodEndDate),
            due_date: toISODate(dueDate),
            amount,
        });

        current = next;
        period++;
    }

    return periods;
}

/**
 * Quét toàn bộ hợp đồng đang "active", tự động tạo hóa đơn UNPAID cho các kỳ
 * đã tới hạn phát sinh mà chưa có hóa đơn (idempotent nhờ UNIQUE INDEX
 * contract_id + period trong DB — chạy lại nhiều lần không tạo trùng).
 */
async function generateDueInvoices() {
    const now = new Date();
    const today = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );

    const { rows: contracts } = await pool.query(`
        SELECT id, start_date, end_date, monthly_rent, payment_step_months
        FROM contracts
        WHERE status = 'active'
    `);

    let created = 0;

    for (const contract of contracts) {
        const duePeriods = buildDuePeriods(contract, today);
        if (!duePeriods.length) continue;

        const { rows: existing } = await pool.query(
            `SELECT period FROM fee_invoices WHERE contract_id = $1 AND period IS NOT NULL`,
            [contract.id]
        );
        const existingPeriods = new Set(existing.map((r) => r.period));

        for (const p of duePeriods) {
            if (existingPeriods.has(p.period)) continue;

            try {
                await pool.query(
                    `
                    INSERT INTO fee_invoices
                        (contract_id, total_amount, status, period, due_date, note, auto_generated)
                    VALUES
                        ($1, $2, 'UNPAID', $3, $4, $5, TRUE)
                    `,
                    [
                        contract.id,
                        p.amount,
                        p.period,
                        p.due_date,
                        `Kỳ ${p.period} (${p.period_start} → ${p.period_end})`,
                    ]
                );
                created++;
            } catch (error) {
                // 23505 = trùng do UNIQUE INDEX (vd job chạy song song) -> bỏ qua an toàn
                if (error.code !== "23505") throw error;
            }
        }
    }

    return created;
}

/**
 * Đánh dấu OVERDUE cho các hóa đơn còn UNPAID nhưng đã quá hạn thanh toán
 * (due_date < hôm nay).
 */
async function markOverdueInvoices() {
    const { rowCount } = await pool.query(`
        UPDATE fee_invoices
        SET status = 'OVERDUE'
        WHERE status = 'UNPAID'
          AND due_date IS NOT NULL
          AND due_date < CURRENT_DATE
    `);

    return rowCount;
}


async function runBillingCycle() {
    const created = await generateDueInvoices();
    const overdue = await markOverdueInvoices();

    

    return { created, overdue };
}

module.exports = {
    buildDuePeriods,
    generateDueInvoices,
    markOverdueInvoices,
    runBillingCycle,
};
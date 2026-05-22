export type Severity = 'critical' | 'high' | 'medium' | 'low'

export interface AnomalyResult {
  detected: boolean
  type: string
  severity: Severity
  description: string
  currentValue: number
  baselineValue: number
  deviationPercent: number
}

class AnomalyDetector {
  /**
   * Detect a drop in sales revenue.
   * Threshold: 30% drop triggers an anomaly.
   */
  detectSalesDrop(
    currentRevenue: number,
    baselineRevenue: number
  ): AnomalyResult {
    if (baselineRevenue <= 0) {
      return this.noAnomaly('sales_drop', currentRevenue, baselineRevenue)
    }

    const dropPercent =
      ((baselineRevenue - currentRevenue) / baselineRevenue) * 100

    if (dropPercent < 30) {
      return this.noAnomaly('sales_drop', currentRevenue, baselineRevenue)
    }

    return {
      detected: true,
      type: 'sales_drop',
      severity: this.calculateSeverity(dropPercent),
      description: `Faturamento com queda de ${dropPercent.toFixed(1)}% em relação à baseline. Atual: R$${currentRevenue.toFixed(2)} vs baseline R$${baselineRevenue.toFixed(2)}.`,
      currentValue: currentRevenue,
      baselineValue: baselineRevenue,
      deviationPercent: dropPercent,
    }
  }

  /**
   * Detect payment anomaly (card approval rate drop).
   * Threshold: 15% below average triggers anomaly.
   */
  detectPaymentAnomaly(
    currentRate: number,
    baselineRate: number
  ): AnomalyResult {
    if (baselineRate <= 0) {
      return this.noAnomaly('payment_anomaly', currentRate, baselineRate)
    }

    const dropPercent = ((baselineRate - currentRate) / baselineRate) * 100

    if (dropPercent < 15) {
      return this.noAnomaly('payment_anomaly', currentRate, baselineRate)
    }

    return {
      detected: true,
      type: 'payment_anomaly',
      severity: this.calculateSeverity(dropPercent),
      description: `Taxa de aprovação de cartão caiu ${dropPercent.toFixed(1)}%. Atual: ${currentRate.toFixed(1)}% vs média ${baselineRate.toFixed(1)}%.`,
      currentValue: currentRate,
      baselineValue: baselineRate,
      deviationPercent: dropPercent,
    }
  }

  /**
   * Detect checkout conversion anomaly.
   * Threshold: 25% drop triggers anomaly.
   */
  detectCheckoutAnomaly(
    currentConvRate: number,
    baselineConvRate: number
  ): AnomalyResult {
    if (baselineConvRate <= 0) {
      return this.noAnomaly('checkout_anomaly', currentConvRate, baselineConvRate)
    }

    const dropPercent =
      ((baselineConvRate - currentConvRate) / baselineConvRate) * 100

    if (dropPercent < 25) {
      return this.noAnomaly('checkout_anomaly', currentConvRate, baselineConvRate)
    }

    return {
      detected: true,
      type: 'checkout_anomaly',
      severity: dropPercent >= 40 ? 'critical' : 'high',
      description: `Taxa de conversão do checkout caiu ${dropPercent.toFixed(1)}%. Atual: ${currentConvRate.toFixed(2)}% vs baseline ${baselineConvRate.toFixed(2)}%.`,
      currentValue: currentConvRate,
      baselineValue: baselineConvRate,
      deviationPercent: dropPercent,
    }
  }

  /**
   * Detect complaint spike.
   * Threshold: 5+ complaints in a given time window triggers anomaly.
   */
  detectComplaintSpike(
    complaintCount: number,
    timeWindowMinutes: number,
    threshold: number = 5
  ): AnomalyResult {
    if (complaintCount < threshold) {
      return this.noAnomaly('complaint_spike', complaintCount, threshold)
    }

    const severity: Severity =
      complaintCount >= threshold * 3
        ? 'critical'
        : complaintCount >= threshold * 2
        ? 'high'
        : 'medium'

    return {
      detected: true,
      type: 'complaint_spike',
      severity,
      description: `${complaintCount} reclamações detectadas nos últimos ${timeWindowMinutes} minutos — ${(complaintCount / timeWindowMinutes).toFixed(1)} reclamações/min. Limiar: ${threshold} em ${timeWindowMinutes}min.`,
      currentValue: complaintCount,
      baselineValue: threshold,
      deviationPercent: ((complaintCount - threshold) / threshold) * 100,
    }
  }

  /**
   * Detect site uptime anomaly.
   */
  detectUptimeAnomaly(
    currentUptime: number,
    baselineUptime: number = 99.9
  ): AnomalyResult {
    const drop = baselineUptime - currentUptime

    if (drop < 0.5) {
      return this.noAnomaly('uptime_drop', currentUptime, baselineUptime)
    }

    return {
      detected: true,
      type: 'uptime_drop',
      severity: currentUptime < 95 ? 'critical' : currentUptime < 98 ? 'high' : 'medium',
      description: `Uptime do site caiu para ${currentUptime.toFixed(2)}% (queda de ${drop.toFixed(2)}pp vs baseline ${baselineUptime.toFixed(2)}%).`,
      currentValue: currentUptime,
      baselineValue: baselineUptime,
      deviationPercent: drop,
    }
  }

  /**
   * Calculate severity based on percentage drop.
   */
  calculateSeverity(dropPercentage: number): Severity {
    if (dropPercentage >= 50) return 'critical'
    if (dropPercentage >= 35) return 'high'
    if (dropPercentage >= 20) return 'medium'
    return 'low'
  }

  private noAnomaly(
    type: string,
    currentValue: number,
    baselineValue: number
  ): AnomalyResult {
    return {
      detected: false,
      type,
      severity: 'low',
      description: '',
      currentValue,
      baselineValue,
      deviationPercent: 0,
    }
  }

  /**
   * Run all detectors against a metrics snapshot.
   */
  runAll(current: {
    revenue: number
    cardApprovalRate: number
    conversionRate: number
    complaintCount: number
    uptime: number
  }, baseline: {
    revenue: number
    cardApprovalRate: number
    conversionRate: number
    uptime: number
  }): AnomalyResult[] {
    const results: AnomalyResult[] = [
      this.detectSalesDrop(current.revenue, baseline.revenue),
      this.detectPaymentAnomaly(current.cardApprovalRate, baseline.cardApprovalRate),
      this.detectCheckoutAnomaly(current.conversionRate, baseline.conversionRate),
      this.detectComplaintSpike(current.complaintCount, 15),
      this.detectUptimeAnomaly(current.uptime, baseline.uptime),
    ]

    return results.filter((r) => r.detected)
  }
}

export const anomalyDetector = new AnomalyDetector()
export default anomalyDetector

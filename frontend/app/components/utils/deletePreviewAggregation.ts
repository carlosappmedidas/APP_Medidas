import type {
  DeleteFilesFilters,
  DeleteImpactIngestionFileItem,
  DeleteImpactPeriod,
  DeleteImpactPreview,
  DeleteImpactRefactura,
} from "../../types";

function buildPeriodKey(p: DeleteImpactPeriod) {
  return `${p.tenant_id}-${p.empresa_id}-${p.anio}-${p.mes}`;
}

function buildIngestionFileKey(f: DeleteImpactIngestionFileItem) {
  return `${f.id}`;
}

function buildRefacturaKey(r: DeleteImpactRefactura) {
  return [
    r.source_period.anio,
    r.source_period.mes,
    r.affected_period.anio,
    r.affected_period.mes,
    r.ingestion_file_id ?? "",
    r.filename ?? "",
    r.energia_kwh ?? "",
  ].join("|");
}

export function aggregateDeletePreviews(previews: DeleteImpactPreview[]): DeleteImpactPreview {
  const ingestionFilesMap = new Map<string, DeleteImpactIngestionFileItem>();
  const affectedGeneralMap = new Map<string, DeleteImpactPeriod>();
  const affectedPsMap = new Map<string, DeleteImpactPeriod>();
  const orphanGeneralMap = new Map<string, DeleteImpactPeriod>();
  const orphanPsMap = new Map<string, DeleteImpactPeriod>();
  const refacturasMap = new Map<string, DeleteImpactRefactura>();

  const summary = {
    ingestion_files_count: 0,
    m1_period_contributions_count: 0,
    general_period_contributions_count: 0,
    bald_period_contributions_count: 0,
    ps_period_detail_count: 0,
    ps_period_contributions_count: 0,
    medidas_general_direct_count: 0,
    medidas_ps_direct_count: 0,
    affected_general_periods_count: 0,
    affected_ps_periods_count: 0,
    orphan_medidas_general_candidate_count: 0,
    orphan_medidas_ps_candidate_count: 0,
    refacturas_m1_count: 0,
  };

  const filters: DeleteFilesFilters = {};

  for (const preview of previews) {
    if (preview.filters.tenant_id != null) filters.tenant_id = preview.filters.tenant_id;

    summary.ingestion_files_count += preview.summary.ingestion_files_count;
    summary.m1_period_contributions_count += preview.summary.m1_period_contributions_count;
    summary.general_period_contributions_count += preview.summary.general_period_contributions_count;
    summary.bald_period_contributions_count += preview.summary.bald_period_contributions_count;
    summary.ps_period_detail_count += preview.summary.ps_period_detail_count;
    summary.ps_period_contributions_count += preview.summary.ps_period_contributions_count;
    summary.medidas_general_direct_count += preview.summary.medidas_general_direct_count;
    summary.medidas_ps_direct_count += preview.summary.medidas_ps_direct_count;

    for (const item of preview.ingestion_files) {
      ingestionFilesMap.set(buildIngestionFileKey(item), item);
    }

    for (const item of preview.affected_general_periods) {
      affectedGeneralMap.set(buildPeriodKey(item), item);
    }

    for (const item of preview.affected_ps_periods) {
      affectedPsMap.set(buildPeriodKey(item), item);
    }

    for (const item of preview.orphan_medidas_general_candidates) {
      orphanGeneralMap.set(buildPeriodKey(item), item);
    }

    for (const item of preview.orphan_medidas_ps_candidates) {
      orphanPsMap.set(buildPeriodKey(item), item);
    }

    for (const item of preview.refacturas_m1) {
      refacturasMap.set(buildRefacturaKey(item), item);
    }
  }

  const ingestion_files = Array.from(ingestionFilesMap.values()).sort((a, b) => {
    if (a.tenant_id !== b.tenant_id) return a.tenant_id - b.tenant_id;
    if (a.empresa_id !== b.empresa_id) return a.empresa_id - b.empresa_id;
    if (a.anio !== b.anio) return a.anio - b.anio;
    if (a.mes !== b.mes) return a.mes - b.mes;
    return a.id - b.id;
  });

  const affected_general_periods = Array.from(affectedGeneralMap.values()).sort((a, b) => {
    if (a.tenant_id !== b.tenant_id) return a.tenant_id - b.tenant_id;
    if (a.empresa_id !== b.empresa_id) return a.empresa_id - b.empresa_id;
    if (a.anio !== b.anio) return a.anio - b.anio;
    return a.mes - b.mes;
  });

  const affected_ps_periods = Array.from(affectedPsMap.values()).sort((a, b) => {
    if (a.tenant_id !== b.tenant_id) return a.tenant_id - b.tenant_id;
    if (a.empresa_id !== b.empresa_id) return a.empresa_id - b.empresa_id;
    if (a.anio !== b.anio) return a.anio - b.anio;
    return a.mes - b.mes;
  });

  const orphan_medidas_general_candidates = Array.from(orphanGeneralMap.values()).sort((a, b) => {
    if (a.tenant_id !== b.tenant_id) return a.tenant_id - b.tenant_id;
    if (a.empresa_id !== b.empresa_id) return a.empresa_id - b.empresa_id;
    if (a.anio !== b.anio) return a.anio - b.anio;
    return a.mes - b.mes;
  });

  const orphan_medidas_ps_candidates = Array.from(orphanPsMap.values()).sort((a, b) => {
    if (a.tenant_id !== b.tenant_id) return a.tenant_id - b.tenant_id;
    if (a.empresa_id !== b.empresa_id) return a.empresa_id - b.empresa_id;
    if (a.anio !== b.anio) return a.anio - b.anio;
    return a.mes - b.mes;
  });

  const refacturas_m1 = Array.from(refacturasMap.values()).sort((a, b) => {
    if (a.affected_period.anio !== b.affected_period.anio) return a.affected_period.anio - b.affected_period.anio;
    if (a.affected_period.mes !== b.affected_period.mes) return a.affected_period.mes - b.affected_period.mes;
    if (a.source_period.anio !== b.source_period.anio) return a.source_period.anio - b.source_period.anio;
    return a.source_period.mes - b.source_period.mes;
  });

  summary.affected_general_periods_count = affected_general_periods.length;
  summary.affected_ps_periods_count = affected_ps_periods.length;
  summary.orphan_medidas_general_candidate_count = orphan_medidas_general_candidates.length;
  summary.orphan_medidas_ps_candidate_count = orphan_medidas_ps_candidates.length;
  summary.refacturas_m1_count = refacturas_m1.length;
  summary.ingestion_files_count = ingestion_files.length;

  return {
    filters,
    summary,
    ingestion_files,
    affected_general_periods,
    affected_ps_periods,
    orphan_medidas_general_candidates,
    orphan_medidas_ps_candidates,
    refacturas_m1,
  };
}
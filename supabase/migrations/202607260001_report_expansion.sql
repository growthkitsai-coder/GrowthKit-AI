-- GrowthKit AI — expanded report stages (2026-07-26)
--
-- Adds the three independently persisted calls for:
--   opportunity       — TAM/SAM/SOM, target segments, trend, search demand
--   strategy_timing   — GTM strategy + window of opportunity
--   capital_metrics   — funding landscape + connected weekly metrics snapshot
--
-- Run after 202607250001_daily_reports.sql. Safe for existing reports: it only
-- widens the allowed section names and does not alter or delete stored rows.

alter table public.report_sections
  drop constraint if exists report_sections_section_check;

alter table public.report_sections
  add constraint report_sections_section_check check (section in (
    'research', 'subject_positioning', 'market_map', 'competitor_teardown',
    'gap_analysis', 'opportunity', 'strategy_timing', 'capital_metrics',
    'plan', 'sources'
  ));

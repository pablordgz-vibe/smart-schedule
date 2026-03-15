alter table identity_config
  alter column supported_social_providers
  set default array['google', 'github', 'microsoft']::text[];

update identity_config
set supported_social_providers = (
  select array_agg(distinct provider order by provider)
  from unnest(
    coalesce(supported_social_providers, array[]::text[]) ||
    array['google', 'github', 'microsoft']::text[]
  ) as provider
)
where not ('microsoft' = any(coalesce(supported_social_providers, array[]::text[])));

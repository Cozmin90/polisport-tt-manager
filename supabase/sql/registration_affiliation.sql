-- Require complete UPB affiliation for self-registration, including reactivation.
-- Existing permissive policies still enforce registration window/capacity/ownership.
-- Administrators retain manual registration access; withdrawals remain possible.
CREATE POLICY registrations_upb_self_insert ON public.registrations
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (status <> 'REGISTERED' OR ( (select public.is_admin()) OR (player_id = (select auth.uid()) AND EXISTS (
 SELECT 1 FROM public.players p WHERE p.id = (select auth.uid()) AND (
 (p.upb_role IN ('student','employee','alumni') AND p.upb_center IN ('BUC','PIT') AND length(btrim(coalesce(p.upb_faculty,''))) > 0)
 OR (p.upb_role = 'partner' AND length(btrim(coalesce(p.upb_partner_name,''))) > 0)
 ))) ));
CREATE POLICY registrations_upb_self_update ON public.registrations
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (true)
WITH CHECK (status <> 'REGISTERED' OR ( (select public.is_admin()) OR (player_id = (select auth.uid()) AND EXISTS (
 SELECT 1 FROM public.players p WHERE p.id = (select auth.uid()) AND (
 (p.upb_role IN ('student','employee','alumni') AND p.upb_center IN ('BUC','PIT') AND length(btrim(coalesce(p.upb_faculty,''))) > 0)
 OR (p.upb_role = 'partner' AND length(btrim(coalesce(p.upb_partner_name,''))) > 0)
 ))) ));


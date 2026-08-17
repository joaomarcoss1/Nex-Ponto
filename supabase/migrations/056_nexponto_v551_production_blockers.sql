-- ============================================================
-- NEXPONTO v5.5 / v5.5.1
-- CORREÇÃO DA FUNÇÃO AUSENTE:
-- reconcile_admin_memberships_v55()
--
-- IDEMPOTENTE / NÃO DESTRUTIVO
-- ============================================================


-- ============================================================
-- 1. GARANTE COLUNAS NECESSÁRIAS
-- ============================================================

alter table public.admin_users
  add column if not exists deactivated_at timestamptz,
  add column if not exists reactivated_at timestamptz;


-- ============================================================
-- 2. GARANTE TABELA DE AUDITORIA
-- ============================================================

create table if not exists public.admin_membership_reconciliation_audit (

  id uuid primary key
    default gen_random_uuid(),

  tenant_id uuid
    references public.tenants(id)
    on delete cascade,

  admin_user_id uuid
    references public.admin_users(id)
    on delete set null,

  membership_id uuid
    references public.tenant_memberships(id)
    on delete set null,

  issue_type text not null,

  action_taken text not null,

  before_snapshot jsonb not null
    default '{}'::jsonb,

  after_snapshot jsonb not null
    default '{}'::jsonb,

  created_at timestamptz not null
    default now()
);


-- ============================================================
-- 3. ÍNDICE
-- ============================================================

create index if not exists
idx_admin_membership_reconciliation_tenant_created

on public.admin_membership_reconciliation_audit (
  tenant_id,
  created_at desc
);


-- ============================================================
-- 4. RECRIA A FUNÇÃO DE RECONCILIAÇÃO
-- ============================================================

create or replace function public.reconcile_admin_memberships_v55()

returns table (
  issue_type text,
  affected_id uuid,
  action_taken text
)

language plpgsql
security definer
set search_path = public, auth, pg_temp

as $$

declare

  admin_row public.admin_users%rowtype;

  membership_row public.tenant_memberships%rowtype;

begin

  -- ==========================================================
  -- A) ADMIN EXISTE, MAS MEMBERSHIP NÃO EXISTE
  -- OU MEMBERSHIP ESTÁ DIVERGENTE
  -- ==========================================================

  for admin_row in

    select *
    from public.admin_users

    where tenant_id is not null
      and auth_user_id is not null

  loop

    membership_row := null;


    select *
    into membership_row

    from public.tenant_memberships

    where tenant_id = admin_row.tenant_id
      and auth_user_id = admin_row.auth_user_id

    for update;


    -- --------------------------------------------------------
    -- MEMBERSHIP NÃO EXISTE
    -- --------------------------------------------------------

    if not found then

      insert into public.tenant_memberships (

        tenant_id,
        auth_user_id,
        admin_user_id,
        role,
        permissions,
        branch_ids,
        active,
        accepted_at

      )

      values (

        admin_row.tenant_id,

        admin_row.auth_user_id,

        admin_row.id,

        admin_row.role::text,

        case

          when admin_row.role::text in (
            'master_admin',
            'tenant_owner',
            'admin_geral',
            'tenant_admin'
          )

          then array['*']::text[]

          else '{}'::text[]

        end,

        coalesce(
          admin_row.allowed_branch_ids,
          '{}'::uuid[]
        ),

        admin_row.active,

        case
          when admin_row.active
            then now()
          else null
        end

      )

      returning *
      into membership_row;


      insert into public.admin_membership_reconciliation_audit (

        tenant_id,
        admin_user_id,
        membership_id,

        issue_type,
        action_taken,

        before_snapshot,
        after_snapshot

      )

      values (

        admin_row.tenant_id,

        admin_row.id,

        membership_row.id,

        'admin_without_membership',

        'membership_created',

        to_jsonb(admin_row),

        to_jsonb(membership_row)

      );


      issue_type :=
        'admin_without_membership';

      affected_id :=
        admin_row.id;

      action_taken :=
        'membership_created';

      return next;


    -- --------------------------------------------------------
    -- MEMBERSHIP EXISTE, MAS ESTÁ DIVERGENTE
    -- --------------------------------------------------------

    elsif

         membership_row.admin_user_id
           is distinct from admin_row.id

      or membership_row.role
           is distinct from admin_row.role::text

      or membership_row.active
           is distinct from admin_row.active

      or coalesce(
           membership_row.branch_ids,
           '{}'::uuid[]
         )
           is distinct from
         coalesce(
           admin_row.allowed_branch_ids,
           '{}'::uuid[]
         )

    then

      -- Guarda estado anterior antes do UPDATE.

      insert into public.admin_membership_reconciliation_audit (

        tenant_id,
        admin_user_id,
        membership_id,

        issue_type,
        action_taken,

        before_snapshot,
        after_snapshot

      )

      values (

        admin_row.tenant_id,

        admin_row.id,

        membership_row.id,

        'admin_membership_drift',

        'membership_update_started',

        jsonb_build_object(
          'admin',
          to_jsonb(admin_row),

          'membership',
          to_jsonb(membership_row)
        ),

        '{}'::jsonb

      );


      update public.tenant_memberships

      set

        admin_user_id =
          admin_row.id,

        role =
          admin_row.role::text,

        branch_ids =
          coalesce(
            admin_row.allowed_branch_ids,
            '{}'::uuid[]
          ),

        active =
          admin_row.active,

        updated_at =
          now()

      where id = membership_row.id

      returning *
      into membership_row;


      -- Atualiza o último evento criado com snapshot final.

      update public.admin_membership_reconciliation_audit

      set

        action_taken =
          'membership_updated',

        after_snapshot =
          to_jsonb(membership_row)

      where id = (

        select id

        from public.admin_membership_reconciliation_audit

        where tenant_id = admin_row.tenant_id
          and admin_user_id = admin_row.id
          and membership_id = membership_row.id
          and issue_type = 'admin_membership_drift'
          and action_taken = 'membership_update_started'

        order by created_at desc, id desc

        limit 1

      );


      issue_type :=
        'admin_membership_drift';

      affected_id :=
        admin_row.id;

      action_taken :=
        'membership_updated';

      return next;

    end if;

  end loop;


  -- ==========================================================
  -- B) MEMBERSHIP APONTA PARA ADMIN QUE NÃO EXISTE
  -- ==========================================================

  for membership_row in

    select tm.*

    from public.tenant_memberships tm

    where tm.admin_user_id is not null

      and not exists (

        select 1

        from public.admin_users au

        where au.id = tm.admin_user_id
          and au.tenant_id = tm.tenant_id

      )

  loop

    insert into public.admin_membership_reconciliation_audit (

      tenant_id,

      admin_user_id,

      membership_id,

      issue_type,

      action_taken,

      before_snapshot,

      after_snapshot

    )

    values (

      membership_row.tenant_id,

      membership_row.admin_user_id,

      membership_row.id,

      'membership_without_matching_admin',

      'audit_only',

      to_jsonb(membership_row),

      '{}'::jsonb

    );


    issue_type :=
      'membership_without_matching_admin';

    affected_id :=
      membership_row.id;

    action_taken :=
      'audit_only';

    return next;

  end loop;


  return;

end;
$$;


-- ============================================================
-- 5. SEGURANÇA
--
-- ESSA FUNÇÃO NÃO DEVE SER CHAMADA PELO FRONTEND.
-- ============================================================

revoke all
on function public.reconcile_admin_memberships_v55()
from public;


revoke all
on function public.reconcile_admin_memberships_v55()
from anon;


revoke all
on function public.reconcile_admin_memberships_v55()
from authenticated;


grant execute
on function public.reconcile_admin_memberships_v55()
to service_role;


-- ============================================================
-- 6. DOCUMENTAÇÃO
-- ============================================================

comment on function
public.reconcile_admin_memberships_v55()

is
'Reconcilia de forma não destrutiva admin_users e tenant_memberships, registrando divergências e correções no ledger de auditoria.';


-- ============================================================
-- 7. VALIDAÇÃO
-- ============================================================

do $$

begin

  if to_regprocedure(
    'public.reconcile_admin_memberships_v55()'
  ) is null then

    raise exception
      'RECONCILE_ADMIN_MEMBERSHIPS_V55_NOT_CREATED';

  end if;


  raise notice
    'reconcile_admin_memberships_v55() criada com sucesso.';

end
$$;
"""Opt-in security proof against a fresh task-owned, unlinked local stack."""
import json
import os
import re
from pathlib import Path
import subprocess
import uuid

assert os.environ.get("ALLOW_LOCAL_PREFLIGHT_TESTS") == "1"
runtime = Path(os.environ["PREFLIGHT_RUNTIME"]).resolve()
assert runtime.parent == Path("/private/tmp") and runtime.name.startswith("wuxuai-preflight-")
assert (runtime / "TASK_OWNED").read_text() == "45b44e0121fbfdf9279f9b37a00a8a29d41e06cf"
assert not (runtime / "supabase/.temp/project-ref").exists()
repo = Path(__file__).resolve().parent.parent
docker = "/Users/wuxugroup/.docker/bin/docker"
container = "supabase_db_wuxuai-preflight-local"
info = json.loads(subprocess.check_output([docker, "inspect", container]))[0]
assert info["State"]["Running"]
assert info["NetworkSettings"]["Ports"]["5432/tcp"][0]["HostPort"] == "56622"


def sql(query, denied=False):
    result = subprocess.run([docker, "exec", "-i", container, "psql", "-X", "-qAt",
                             "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
                            input=query, text=True, capture_output=True, timeout=30)
    if denied:
        assert result.returncode != 0, "EXPECTED_DENIAL_MISSING"
        return result.stderr
    if result.returncode != 0:
        diagnostic = result.stderr.splitlines()[0] if result.stderr else "LOCAL_SQL_FAILED"
        diagnostic = re.sub(r"[0-9a-f]{8}-[0-9a-f-]{27,}", "[ID]", diagnostic)
        raise AssertionError(diagnostic)
    return result.stdout.strip()


def fixture(query):
    return sql("BEGIN; SET LOCAL session_replication_role=replica; " + query + " COMMIT;")


assert sql("SHOW cron.launch_active_jobs") == "off"
assert sql("SELECT count(*) FROM supabase_migrations.schema_migrations") == "193"
assert sql("SELECT count(*) FROM public.restaurants") == "0"
ids = {key: str(uuid.uuid4()) for key in
       ["owner", "auth", "org", "restaurant", "branch", "customer", "account", "reward", "grant"]}
fixture(f"""
INSERT INTO auth.users(id,aud,role,created_at,updated_at)
VALUES ('{ids['owner']}','authenticated','authenticated',now(),now()),
('{ids['auth']}','authenticated','authenticated',now(),now());
INSERT INTO public.organizations(id,owner_id,name,status)
VALUES ('{ids['org']}','{ids['owner']}','Synthetic Preflight','active');
INSERT INTO public.restaurants(id,owner_id,name,slug,status,organization_id)
VALUES ('{ids['restaurant']}','{ids['owner']}','Synthetic Preflight',
'wuxuai-test-only-pro-phase-1','active','{ids['org']}');
INSERT INTO public.branches(id,organization_id,restaurant_id,name,slug,country,status)
VALUES ('{ids['branch']}','{ids['org']}','{ids['restaurant']}','Synthetic Main','main','AT','active');
UPDATE public.restaurants SET primary_branch_id='{ids['branch']}' WHERE id='{ids['restaurant']}';
INSERT INTO public.branch_subscriptions(organization_id,branch_id,status,subscription_status,
plan_key,payment_status,trial_started_at,trial_ends_at)
VALUES ('{ids['org']}','{ids['branch']}','trialing','trialing','BASIC','not_required',
now()-interval '1 day',now()+interval '20 days');
UPDATE public.business_verification_environment SET environment='STAGING' WHERE singleton;
INSERT INTO public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,
owner_user_id,test_session_id,marked_by)
VALUES ('{ids['restaurant']}','Synthetic Preflight','{ids['org']}','{ids['owner']}',
'preflight-local-{ids['restaurant']}','{ids['owner']}');
INSERT INTO public.customers(id,restaurant_id,organization_id,branch_id,auth_user_id,
name,customer_code,normalized_phone,membership_status,is_test_customer,points_balance)
VALUES ('{ids['customer']}','{ids['restaurant']}','{ids['org']}','{ids['branch']}',
'{ids['auth']}','Synthetic','PREFLIGHT','+436600000001','active',true,65);
INSERT INTO public.customer_accounts(id,auth_user_id,first_name)
VALUES ('{ids['account']}','{ids['auth']}','Synthetic');
INSERT INTO public.customer_account_memberships(account_id,restaurant_id,customer_id)
VALUES ('{ids['account']}','{ids['restaurant']}','{ids['customer']}');
INSERT INTO public.rewards(id,restaurant_id,organization_id,branch_id,title,required_points,active,is_starter_reward)
VALUES ('{ids['reward']}','{ids['restaurant']}','{ids['org']}','{ids['branch']}','Synthetic',109,true,false);
INSERT INTO public.loyalty_settings(restaurant_id,organization_id,branch_id,loyalty_mode,
amount_per_point,points_collection_mode)
VALUES ('{ids['restaurant']}','{ids['org']}','{ids['branch']}','amount_based',1,'restaurant_controlled_only');
INSERT INTO public.commercial_pro_access_grants(id,restaurant_id,organization_id,access_kind,
starts_at,expires_at,reason,created_by,request_id)
VALUES ('{ids['grant']}','{ids['restaurant']}','{ids['org']}','INTERNAL_TEST_ONLY',
now()-interval '1 hour',now()+interval '1 day','Synthetic local security proof',
'{ids['owner']}','{uuid.uuid4()}');
""")
sql((repo / "scripts/sql/staging-test-only-preflight-access.sql").read_text())
reader = "BEGIN READ ONLY; SET LOCAL ROLE wuxuai_test_preflight_reader; "


def read():
    return json.loads(sql(reader + "SELECT wuxuai_test_preflight.read_65_to_109(); COMMIT;"))


baseline = read()
assert baseline["status"] == "READ_ONLY_PREFLIGHT_PASS_AWAIT_SEPARATE_WRITE_APPROVAL"
assert baseline["points"] == 65 and baseline["effective_test_pro"] is True
assert baseline["daily_limit_remaining"] == 2
assert sql(reader + "SELECT current_user; SHOW transaction_read_only; COMMIT;") == \
    "wuxuai_test_preflight_reader\non"
for table in ["customers", "rewards", "points_transactions", "customer_rewards",
              "customer_pro_in_app_notifications", "commercial_pro_access_grants",
              "customer_accounts", "customer_account_memberships"]:
    assert "permission denied" in sql(reader + f"SELECT * FROM public.{table};", denied=True)
assert "permission denied" in sql("BEGIN READ ONLY; SET LOCAL ROLE authenticated; "
                                 "SELECT wuxuai_test_preflight.read_65_to_109();", denied=True)
assert "READ_ONLY_TRANSACTION_REQUIRED" in sql(
    "BEGIN READ WRITE; SET LOCAL ROLE wuxuai_test_preflight_reader; "
    "SELECT wuxuai_test_preflight.read_65_to_109();", denied=True)
assert "read-only" in sql(reader + f"UPDATE public.customers SET points_balance=109 "
                         f"WHERE id='{ids['customer']}';", denied=True)
assert "read-only" in sql(reader + "CREATE TABLE public.preflight_forbidden(id int);", denied=True)
assert "permission denied" in sql("BEGIN READ WRITE; SET LOCAL ROLE wuxuai_test_preflight_reader; "
                                 f"UPDATE public.customers SET points_balance=109 WHERE id='{ids['customer']}';",
                                 denied=True)

# The true server resolver is used throughout, never an entitlement mock.
fixture(f"UPDATE public.commercial_pro_access_grants SET expires_at=now()-interval '1 minute' "
        f"WHERE id='{ids['grant']}';")
assert read()["effective_test_pro"] is False
assert read()["status"] == "STOP_PRO_TEST_GRANT_NOT_EFFECTIVE"
fixture(f"UPDATE public.commercial_pro_access_grants SET expires_at=now()+interval '1 day' "
        f"WHERE id='{ids['grant']}';")
fixture(f"INSERT INTO public.customer_reward_notification_state(restaurant_id,customer_id,reward_id) "
        f"VALUES ('{ids['restaurant']}','{ids['customer']}','{ids['reward']}');")
assert read()["status"] == "STOP_TARGET_EFFECT_ALREADY_EXISTS"
fixture(f"DELETE FROM public.customer_reward_notification_state WHERE restaurant_id='{ids['restaurant']}';")
extra = str(uuid.uuid4())
fixture(f"INSERT INTO public.customers(id,restaurant_id,organization_id,branch_id,name,customer_code,"
        f"normalized_phone,membership_status,is_test_customer,points_balance) VALUES ('{extra}','{ids['restaurant']}',"
        f"'{ids['org']}','{ids['branch']}','Synthetic extra','EXTRA','+436600000002','active',true,65);")
assert read() == {"status": "AMBIGUOUS", "customer_candidates": 2, "branches": 1}
fixture(f"DELETE FROM public.customers WHERE id='{extra}';")
assert read()["status"] == baseline["status"]
assert read()["points"] == 65
# Missing PRO fields (pending activation) fail closed as one complete condition.
fixture(f"UPDATE public.restaurants SET activation_status='pending_activation' WHERE id='{ids['restaurant']}';")
assert read()["effective_test_pro"] is False
fixture(f"UPDATE public.restaurants SET activation_status=NULL WHERE id='{ids['restaurant']}';")
# A second eligible threshold stops before any business action.
other_reward = str(uuid.uuid4())
fixture(f"INSERT INTO public.rewards(id,restaurant_id,organization_id,branch_id,title,required_points,active,is_starter_reward) "
        f"VALUES ('{other_reward}','{ids['restaurant']}','{ids['org']}','{ids['branch']}','Synthetic extra',100,true,false);")
assert read()["status"] == "STOP_REWARD_WINDOW_NOT_EXACTLY_ONE_109_THRESHOLD"
fixture(f"DELETE FROM public.rewards WHERE id='{other_reward}';")
# An existing target inbox row is never mistaken for an empty baseline.
fixture(f"INSERT INTO public.customer_pro_in_app_notifications(restaurant_id,customer_id,event_type,event_key,source_entity_id,reward_id) "
        f"VALUES ('{ids['restaurant']}','{ids['customer']}','POINT_REWARD_AVAILABLE','{ids['reward']}','{ids['reward']}','{ids['reward']}');")
assert read()["status"] == "STOP_TARGET_EFFECT_ALREADY_EXISTS"
fixture(f"DELETE FROM public.customer_pro_in_app_notifications WHERE restaurant_id='{ids['restaurant']}';")
assert read()["status"] == baseline["status"]
assert sql(f"SELECT points_balance FROM public.customers WHERE id='{ids['customer']}';") == "65"
assert sql("SELECT count(*) FROM public.points_transactions") == "0"
assert sql("SELECT count(*) FROM public.customer_pro_in_app_notifications") == "0"
audit = json.loads(sql((repo / "scripts/sql/staging-test-only-preflight-audit.sql").read_text()))
assert audit["transaction_read_only"] == "on" and audit["direct_table_read_count"] == 0
assert audit["fixed_aggregate_execute"] is True and audit["points_mutator_execute"] is False
# Do not mistake safe fixed-profile execution for a query-only global principal.
assert audit["other_callable_volatile_definers"] > 0
print("QUERY-ONLY ROLE GAP: inherited PUBLIC function rights remain; no login may be issued.")
print("LOCAL FIXED-PROFILE SECURITY PASS: real SQL connections, readonly enforcement, table/DML/DDL denials, "
      "grant expiry, prior target state and ambiguity; zero points/inbox effects.")

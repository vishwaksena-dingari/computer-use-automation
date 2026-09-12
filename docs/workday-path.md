# Live Workday path
#
# Real tenants (e.g. NVIDIA) require Create Account / Sign In before forms appear.
# Do **not** auto-create accounts on employer sites from CI.
#
# Scaffold (Apply → Apply Manually → fill email/password, no account creation):
#   # optional real tenant login:
#   export WORKDAY_EMAIL='…'
#   export WORKDAY_PASSWORD='…'
#   npx cua replay capabilities/apply-workday-live-scaffold.json \
#     --config .scratch/config.workday-nvidia.yaml \
#     --profile fixtures/applicant-profile-workday.json \
#     --mode hybrid --write-field-map
#
# Env overlays (also ATS_EMAIL / ATS_PASSWORD): WORKDAY_EMAIL, WORKDAY_PASSWORD
# merge onto `--profile` at invoke/replay time.
#
# Until credentials exist, use the local multipage substitute (proven auto, llmCalls:0):
#   npx cua replay capabilities/apply-workday-shaped-auto.json \
#     --config .scratch/config.workday-shaped.yaml \
#     --profile fixtures/applicant-profile-workday.json --mode hybrid
#
# Multipage: `fillFormFlow` re-observes each page, fills, clicks Sign In/Next (no Submit Application).
# Live Workday often shows SSO chooser first — scaffold clicks **Sign in with email** before fill.
# Prefer visible locators when labels collide across hidden SPA steps.

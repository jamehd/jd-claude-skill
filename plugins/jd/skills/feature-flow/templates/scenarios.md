# Scenario catalogue

Every acceptance scenario in the project. `active` scenarios stay in the regression suite forever:
suite `gate` runs in every build, suite `nightly` runs nightly and in builds of its own feature.
States: `proposed` (brief awaiting approval), `approved` (brief approved, feature not yet
accepted), `active` (feature accepted), `changed` (replaced with owner approval; points to the new
ID), `retired` (removed with owner approval).

Quality budget rows (`<ID>-Q<n>`) live here too; their summary states the budget and the action.

| Scenario | Feature | Summary | State | Suite | Automated test |
|---|---|---|---|---|---|

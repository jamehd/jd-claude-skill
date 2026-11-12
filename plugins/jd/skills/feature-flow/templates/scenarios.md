# Scenario catalogue

Every acceptance scenario in the project. `active` scenarios run in every build, forever.
States: `proposed` (brief awaiting approval), `approved` (brief approved, feature not yet
accepted), `active` (feature accepted), `changed` (replaced with owner approval; points to the new
ID), `retired` (removed with owner approval).

Quality budget rows (`<ID>-Q<n>`) live here too; their summary states the budget and the action.

| Scenario | Feature | Summary | State | Automated test |
|---|---|---|---|---|

# Android App Agent Instructions

- Prefer stable, non-deprecated Android and Kotlin APIs. If a deprecated symbol is unavoidable, document why in code comments and look for an alternative first.
- Align new Gradle or manifest configuration with the module's existing compile and target SDK (currently API 35) unless specifically instructed otherwise.
- Favor Kotlin idioms (e.g., scope functions, sealed types) and keep coroutine code structured concurrency friendly.
- Update or add automated checks (lint, unit tests) relevant to changes in this module when introducing new functionality.

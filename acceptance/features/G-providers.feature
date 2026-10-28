@api
Feature: G — Providers and privacy
  As a person who may have put an API key in configuration
  I want it used only where I intended and never exposed
  So that switching providers is safe

  Scenario: G1 — The app offers only providers that can actually work
    Given only the OpenAI-compatible endpoint is configured
    When I read the configuration
    Then that provider is marked configured and every other one is not
    And the configured default provider is what the interface selects
    Given nothing at all is configured
    Then the default provider is local

  Scenario: G2 — Keys never reach the browser
    When every route is exercised, including failures
    Then no response body contains the API key

  Scenario: G3 — A client cannot redirect a keyed provider
    Given a request that supplies its own endpoint address for the keyed provider
    When I fix a prompt
    Then the request still goes to the configured endpoint
    Given a request that supplies a non-http address for a key-less endpoint
    Then it is refused

  Scenario: G4 — Model lists are live where possible and honest where not
    Given the provider answers with its model list
    When I ask for models
    Then I get the live list, labelled live
    Given the provider rejects the key
    When I ask for models
    Then I am told the key was rejected, not shown a fallback list
    Given a provider with no key configured
    When I ask for models
    Then I am told the key is missing instead of a guess

  @nightly
  Scenario: G5 — The journey is the same on every provider
    When the same prompt is fixed on the local provider and the compatible one
    Then the shape of the result and the guard behaviour are identical

  Scenario: G6 — The API is reachable only from this machine
    When a request arrives with a foreign origin
    Then it is not granted cross-origin access
    When a request arrives from a localhost origin
    Then it is
    When a request to change or test a key is addressed to a name other than this machine's
    Then it is refused, and the key is left as it was

  Scenario: G7 — A key added in Settings works at once and stays on this computer
    Given a cloud provider with no key
    When I add a key for it in Settings
    Then the provider is offered as ready at once, with no restart, and Settings says the key is its own
    And no reply carries the key back
    And the key is written to the app's own settings file, where an app started again finds it
    When I remove the key
    Then the provider needs a key again, and the file holds it no longer

  Scenario: G8 — Settings refuses what is not a key, and leaves a key set elsewhere alone
    Given a settings file that holds notes and settings of my own
    When I add a key with a line break, a space or a quote in it, or one too short to be a key
    Then it is refused without being repeated back, and the file is unchanged to the byte
    When I add a key copied together with its name, the way it stands in a settings file
    Then only the key is kept, and every other line of the file is as it was
    Given a key set in the system environment
    Then Settings says it is set elsewhere, and will neither replace nor remove it

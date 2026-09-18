# ADR 0001: Canonical assignment, interview, and call states

## Decision

The durable workflow uses these state machines. Database checks, domain schemas,
repositories, worker handlers, and UI contracts must use these exact values.

| Aggregate  | State                                           | Allowed next states                                                            |
| ---------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Assignment | `queued`                                        | `claimed`, `expired`, `cancelled`                                              |
| Assignment | `claimed`                                       | `interview_started`, `queued`, `no_answer`, `declined`, `expired`, `cancelled` |
| Assignment | `interview_started`                             | `completed`, `no_answer`, `declined`, `cancelled`                              |
| Assignment | `no_answer`                                     | `queued`, `expired`, `cancelled`                                               |
| Assignment | `completed`, `declined`, `expired`, `cancelled` | none                                                                           |
| Interview  | `created`                                       | `in_progress`, `aborted`                                                       |
| Interview  | `in_progress`                                   | `completed`, `aborted`                                                         |
| Interview  | `completed`, `aborted`                          | none                                                                           |
| Call       | `created`                                       | `manual_dial_ready`, `dialing`, `failed`                                       |
| Call       | `manual_dial_ready`                             | `dialing`, `answered`, `no_answer`, `failed`                                   |
| Call       | `dialing`                                       | `ringing`, `answered`, `no_answer`, `failed`                                   |
| Call       | `ringing`                                       | `answered`, `no_answer`, `failed`                                              |
| Call       | `answered`                                      | `completed`, `failed`                                                          |
| Call       | `completed`, `no_answer`, `failed`              | none                                                                           |

`interview_started` is the assignment state; `in_progress` is the corresponding
interview state. `manual_dial_ready` describes a call attempt and never implies
that an interview was reached. Transition services must append an assignment
transition in the same transaction that updates the assignment projection.

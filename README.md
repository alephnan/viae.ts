# Introduction

Viae.ts is a library to define a directed-acylic-graph of async functions that produce promises and (can) depend on other nodes' produced value. The library efficiently visits the graph, handling promise resolution and dependency injection.

## Background

While working at Waze, I encountered a need to provision a graph of REST resources. These tasks are asynchronous and are parameterized by values derived from the output
of other asynchronous tasks.

It's cumbersome to imperatively orchestrate these tasks while meeting these requirements:

- avoid code duplication but maintain composability
- optimize parallelization and fan-out
- checkpoint failures and the distraction of promise chaining to escape nested hell

The set of tasks involved complex set of business logic and was effectively a
dependency graph.

The library affords a explicit declarative definition of dependency relationship of tasks, while abstracting away actually having to execute these tasks.

## About the name

The name Viae is derived from the latin word for road. Viae is commonly associated with
the complex network of roads in the Roman empire, which is apt for a library performing graph traversal.

The alternative usage of viae is 'argument'. The philosopher Thomas Quinas provided five arguments dubbed Quinque Viae or "Five Ways" which are logical formulations predicating on the idea that things which exist in the universe are either caused by some other prior process, or uncaused. In the graph defined with the Viae.ts, there are two classes of nodes: `value` nodes which just are and `function` nodes which must be invoked to produce a value.

Finally, this project was conceived at Waze which is play on the word "ways" which is rooted from viae.

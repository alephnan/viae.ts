/**
 * A library which executes an DAG of async functions.
 *
 * Async DAG definition
 * =========
 * With respect to data flow, there are two classes of nodes:
 *   - source: yield data
 *   - sink: a function which consumes data
 *
 * An async DAG instance is recursively defined as:
 *   - base case: Data nodes which are source nodes / terminal nodes.
 *     Data nodes do not depend on other nodes. From a functional
 *     programming perspective, Data nodes are treated as data
 *     (rather than computation).
 *   - recursive case: async function nodes which are inner nodes and is
 *     both sink and source. These nodes depend on other node, but can
 *     also be depended on. From a functional programming perspective,
 *     Async Function nodes are treated as data AND computation.
 *
 * Nodes are named and registered using with:
 *   - PromiseGraph#valueNode:any JavaScript value including primitives, objects, even
 *     functions (treated as data)
 *   - PromiseGraph#AsyncFunction: a function which returns a promise. This function
 *     is treated as a computation and applied. Its output is treated as data.
 *
 * Dependencies
 * ==========
 * Source-sink relations, aka dependencies, are encoded in the formal parameters
 * of a function. The argument name must match the name of a node in the graph.
 *
 * The resolved values of a given dependency's promise is dependency injected by
 * the library. See Resolution section.
 *
 * Execution
 * ==========
 * The graph is not traversed until PromiseGraph#Execute is invoked. For
 * a given Execution, there is an anonymous function which serves as a
 * sink node entrypointing into the graph by depending on one or more
 * nodes registered in the graph.
 *
 * A PromiseGraph can be executed more than once.
 *
 * Resolution / Auto-unboxing of promises
 * ==========
 * Data nodes resolve to their value.
 *
 * Async Function nodes resolve to the value of the promise it returns.
 *
 * The library unwraps promises and applies the value of the promise to
 * functions which depend on the aforementioned Async Function node.
 *
 * Memoization
 * ==========
 * Suppose multiple sink nodes depend on a source node. The library will resolve
 * the value of the source node exactly once.
 *
 * In the case where the source is a value node, it's not a big deal if the node
 * is traversed multiple times. Even if the object is mutated by some outside
 * process, the library resolves the object not a copy, so this is okay too.
 * In the case of functions, resolving the value gets expensive, so the result
 * is memorized. An analogy is a memoized Fibonacci implementation.
 *
 * The memoizing is on a per-execution basis. Each execution starts a clean slate
 * by flushing the cache.
 *
 * Declarative API and order-independence
 * ==========
 * Declaration order of nodes do not matter, other than that
 * all the relevant nodes have been registered by the time of an execution.
 *
 * Moreover, the order in which dependencies are specified should not affect
 * their values. The traversal is DFS, and since nodes may not resolve until
 * other nodes are resolved, the order in which arguments are specified may
 * implicate the resolution order. While this may have performance implications,
 * correctness is utmost. There may be a loss of parallelization, and in a
 * simplified worst-case analysis would be the sum of the time it takes all
 * the async nodes to resolve if they were to be done sequentially.
 *
 * Usage
 * ==========
 * const graph: AsyncGraphAPI = new AsyncGraph();
 * graph.data('age', 1);
 * graph.computation('birthday', function(age) {
 *   return Promise.resolve(age+1);
 * });
 * graph.execute(function(birthday) {
 *   console.log(birthday);
 * });
 */
enum NodeType {
  Data,
  // Promise produced by executed Async function. Pending resolution to Data.
  Promise,
  // Denotes the function associated with g#execute, since it has similar
  // properties to AsyncFunction nodes and is treated similarly.
  Executable,
  FunctionAsync,
  // Promise for FunctionAsyncExecutable node.
  PromiseFunctionAsyncExecutable,
  // Invocable  Async Function.
  FunctionAsyncExecutable,
}
interface DataNode {
  type: NodeType.Data;
  name: string;
  value: any;
}
interface PromiseNode {
  type: NodeType.Promise;
  name: string;
  value: Promise<any>;
  dependencies: string[];
}
interface FunctionAsyncNode {
  type: NodeType.FunctionAsync;
  name: string;
  value: FunctionAsync;
  dependencies: string[];
}
interface PromiseFunctionAsyncExecutableNode {
  type: NodeType.PromiseFunctionAsyncExecutable;
  name: string;
  value: FunctionAsync;
  dependencies: string[];
  resolvedValuesPromise: Promise<any[]>;
}
interface ExecutableNode {
  type: NodeType.Executable;
  name: string;
  value: any;
  dependencies: string[];
}
type FunctionAsyncDerivativeNode =
  | PromiseNode
  | FunctionAsyncNode
  | PromiseFunctionAsyncExecutableNode;
type UncausedNode = DataNode;
type CausedNode = FunctionAsyncDerivativeNode | ExecutableNode;
type GraphNode = UncausedNode | CausedNode;
type FunctionAsync = (...args: any[]) => Promise<any>;
type ExecutableFunctionAsync = (...args: any[]) => Promise<any>;
export interface AsyncGraphAPI {
  execute(executableNode: Function): Promise<void>;
  asyncFunction(name: string, value: FunctionAsync): void;
  data(name: string, value: any): void;
}
// Utility for extracting argument name from anonymous functions.
class FunctionParser {
  // Patterns extracted from AngularJS
  // https://github.com/angular/angular.js/blob/master/src/auto/injector.js
  private readonly ARROW_DECLARATION = /^([^(]+?)=>/;
  private readonly FUNCTION_DECLARATION = /^[^(]*\(\s*([^)]*)\)/m;
  private readonly STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/gm;
  constructor() {}
  private stringifyFn(fn: Function): string {
    return Function.prototype.toString.call(fn);
  }
  extractArgs(fn: Function) {
    const fnText = this.stringifyFn(fn).replace(this.STRIP_COMMENTS, '');
    return (
      fnText.match(this.ARROW_DECLARATION) ||
      fnText.match(this.FUNCTION_DECLARATION)
    );
  }
}
const functionParser = new FunctionParser();
export class AsyncGraph {
  private readonly ROOT_NODE_NAME = 'root';
  private dependencies: {
    [key: string]: GraphNode;
  } = {};
  private executionId = 0;
  // Isolate data for each execution.
  private executions: {
    // Key is executionId.
    [key: number]: {
      copy: {
        [key: string]: GraphNode;
      };
      cache: {
        [key: string]: GraphNode;
      };
    };
  } = {};
  /**
   * Invokes the given function with values injected for the dependencies.
   * The injected values are the produced values of functional dependencies,
   * and not to be confused as an execution pipeline of specified dependencies.
   **/
  execute(executableNode: Function): Promise<void> {
    this.executionId++;
    const nodeName = this.ROOT_NODE_NAME;
    const execution = {
      copy: Object.assign(
        {
          [nodeName]: {
            name: nodeName,
            type: NodeType.Executable,
            value: executableNode,
            dependencies: this.extractFunctionArgs(executableNode),
          },
        },
        this.dependencies
      ),
      cache: {},
    };
    this.executions[this.executionId] = execution;
    const ancestors = [];
    return this.resolveDependencies(
      this.executionId,
      executableNode,
      nodeName,
      ancestors
    ).then(dependencies => executableNode.apply(executableNode, dependencies));
  }
  // Convert Node.FunctionAsync to NodeType.PromiseFunctionAsyncExecutable nodes.
  private makeFunctionAsyncNodesExecutable(
    executionId: number,
    // TODO: can be replaced with nodeName, since nodes store their dependencies
    // value now..
    names: string[],
    ancestors: string[]
  ) {
    return names.map(nodeName => {
      const node: GraphNode = this.executions[executionId].copy[nodeName];
      if (!node) {
        throw new Error(`Node '${nodeName}' was not found in graph.`);
      }
      // TODO(b/153010141): deprecate and perform at registration time, once
      // nodes registered in order.
      if (node.type == NodeType.FunctionAsync) {
        const resolvedValuesPromise: Promise<any[]> = this.resolveDependencies(
          executionId,
          node.value,
          node.name,
          ancestors
        );
        return (this.executions[executionId].copy[nodeName] = {
          type: NodeType.PromiseFunctionAsyncExecutable,
          value: node.value,
          resolvedValuesPromise,
          name: nodeName,
          dependencies: node.dependencies,
        });
      }
      return node;
    });
  }
  private resolveDependencies(
    executionId: number,
    target: Function,
    name: string,
    ancestors: string[]
  ): Promise<any[]> {
    const graphNode: GraphNode = this.executions[executionId].copy[name];
    if (graphNode.type == NodeType.Data) {
      throw new Error('Internal error. Did not expect data node');
    }
    // Resolve name of dependencies.
    const formalParameters: string[] = graphNode.dependencies;
    // Checks for a backedge, effectively implements cycle detection.
    // TODO(b/153010141): Can be deprecated once we enforce nodes registered in topological order..
    for (let i = 0; i < formalParameters.length; i++) {
      const index = ancestors.indexOf(formalParameters[i]);
      if (index >= 0) {
        throw new Error(
          `Node '${name}' depends on '${formalParameters[i]}'` +
            ` which is actually an ancestor: ` +
            `${ancestors.join('->')}->${name}->${formalParameters[i]}`
        );
      }
    }
    this.makeFunctionAsyncNodesExecutable(executionId, formalParameters, [
      ...ancestors,
      name,
    ]);
    // Promise to resolve dependencies for Node.PromiseFunctionAsyncExecutable
    const resolvedValuesPromises: Array<Promise<any[]>> = [];
    const promiseFunctionAsyncExecutableNodes: PromiseFunctionAsyncExecutableNode[] = [];
    formalParameters.forEach((name: string) => {
      const node: GraphNode = this.executions[executionId].copy[name];
      if (node.type == NodeType.PromiseFunctionAsyncExecutable) {
        resolvedValuesPromises.push(node.resolvedValuesPromise);
        promiseFunctionAsyncExecutableNodes.push(node);
      }
    });
    return (
      Promise.all(resolvedValuesPromises)
        // Reduce Node.FunctionAsync nodes with their resolved values to Node.Promise
        .then((resolvedValuesValues: any[][]) => {
          promiseFunctionAsyncExecutableNodes.forEach((node, i) => {
            // In the time this set of executable node was being resolved, the
            // particular node may have been resolved by an earlier iteration.
            if (this.executions[executionId].cache[node.name]) {
              return;
            }
            const resolvedValues: any[] = resolvedValuesValues[i];
            // Invoke the function, which produces a Promised value.
            let promiseNodeValue: Promise<any>;
            try {
              promiseNodeValue = node.value.apply(node.value, resolvedValues);
            } catch (e) {
              const reason = `threw error: (${e})`;
              throw this.getNodeError(
                ancestors,
                name,
                node,
                resolvedValues,
                reason
              );
            }
            if (!promiseNodeValue.catch) {
              console.warn(
                `${node.name} produced (${JSON.stringify(
                  promiseNodeValue
                )}) which is not a Promise, wrapping in promise.`
              );
              promiseNodeValue = Promise.resolve(promiseNodeValue);
            }
            promiseNodeValue = promiseNodeValue.catch(e => {
              const reason = `returned Promise rejected with (${e})`;
              throw this.getNodeError(
                ancestors,
                name,
                node,
                resolvedValues,
                reason
              );
            });
            this.executions[executionId].copy[node.name] = {
              type: NodeType.Promise,
              value: promiseNodeValue,
              name: node.name,
              dependencies: node.dependencies,
            };
          });
        })
        // Reduce Node.Promise nodes to Node.Data.
        .then(() => {
          // Promises for upstream Node.Promise
          const promiseNodePromises: Array<Promise<PromiseNode>> = [],
            promiseNodeNames: string[] = [];
          formalParameters.forEach(name => {
            const promiseNode = this.executions[executionId].copy[name];
            if (promiseNode.type == NodeType.Promise) {
              promiseNodePromises.push(promiseNode.value);
              promiseNodeNames.push(name);
            }
          });
          return Promise.all(promiseNodePromises).then(promiseNodes => {
            promiseNodeNames.forEach((name, i) => {
              const node: DataNode = {
                type: NodeType.Data,
                value: promiseNodes[i],
                name,
              };
              this.executions[executionId].copy[name] = node;
              this.executions[executionId].cache[name] = node;
            });
          });
        })
        .then(() =>
          formalParameters.map(
            name => this.executions[executionId].copy[name].value
          )
        )
    );
  }
  private getNodeError(
    ancestors: string[],
    parentName: string,
    node: CausedNode,
    resolvedValues: string[],
    reason: string
  ) {
    const trace = ancestors.concat([parentName, node.name]).join('->');
    const params = node.dependencies.map((e, i) => `${e}=${resolvedValues[i]}`);
    const message = `Error on path ${trace}. call ${node.name}(${params}) ${reason}`;
    return new Error(message);
  }
  data(name: string, value: any) {
    this.validateNodeName(name);
    this.dependencies[name] = {
      type: NodeType.Data,
      value,
      name,
    };
  }
  functionAsync(name: string, value: FunctionAsync) {
    this.validateNodeName(name);
    this.dependencies[name] = {
      type: NodeType.FunctionAsync,
      value,
      name,
      dependencies: this.extractFunctionArgs(value),
    };
  }
  private validateNodeName(name: string) {
    if (this.dependencies[name]) {
      throw new Error(`'${name}' is already registered`);
    }
    if (name.trim() !== name) {
      throw new Error('Node name cannot contain whitespace');
    }
    if (name.length == 0) {
      throw new Error('Node name cannot be empty');
    }
    if (name === this.ROOT_NODE_NAME) {
      throw new Error(`Node cannot be named 'root' to avoid confusion`);
    }
    // Checks if node name can be used as valid JS variable identifier,
    // since functions have these dependency injected.
    try {
      new Function(name, 'var ' + name);
    } catch (_) {
      throw new Error(`'${name}' is not a valid variable name`);
    }
  }
  private extractFunctionArgs(f: Function): string[] {
    const argsMatch = functionParser.extractArgs(f);
    if (argsMatch === null || argsMatch.length < 2) {
      throw new Error(`Invalid function declaration: ${f}.`);
    }
    const argsString = argsMatch[1].trim();
    const isNoArgumentFn = argsString.length === 0;
    if (isNoArgumentFn) {
      return [];
    }
    return argsString.split(',').map(arg => arg.trim());
  }
}

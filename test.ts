import { AsyncGraph } from './index';

const DELAY_MILLIS = 1;
describe('AsyncGraph', () => {
  it('should throw with node name containing errors', () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    expect(() => g.value(' foo ', 1)).toThrowError(
      'Node name cannot contain whitespace'
    );
  });
  it('should throw with node name is empty', () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    expect(() => g.value('', 1)).toThrowError('Node name cannot be empty');
  });
  it('should throw if node name already registered', () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    g.value('foo', 1);
    expect(() => g.value('foo', 2)).toThrowError(`'foo' is already registered`);
  });
  it('should throw if node name is invalid variable name', () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    expect(() => g.value('f oo', 1)).toThrowError(
      `'f oo' is not a valid variable name`
    );
  });
  it(`should throw if node name is the reserved keyword 'function'`, () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    expect(() => g.value('function', 1)).toThrowError(
      `'function' is not a valid variable name`
    );
  });
  it(`should throw if node name is the reserved keyword 'var'`, () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    expect(() => g.value('var', 1)).toThrowError(
      `'var' is not a valid variable name`
    );
  });
  it(`should throw if node name is an invalid variable name starting with '.'`, () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    expect(() => g.value('.foo', 1)).toThrowError(
      `'.foo' is not a valid variable name`
    );
  });
  it(`should not throw if node name starts with '$' which is a valid variable
       name`, () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    expect(() => g.value('$foo', 1)).not.toThrow();
  });
  it(`should not throw if node name starts with '_' which is a valid variable
       name`, () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    expect(() => g.value('_foo', 1)).not.toThrow();
  });
  it('should allow ES6 arrow function', () => {
    expect.assertions(2);
    const g = new AsyncGraph();
    g.value('num', 1);
    g.functionAsync('foo', num => Promise.resolve(num + 1));
    return g.entryPoint((num, foo) => {
      expect(num).toBe(1);
      expect(foo).toBe(2);
    });
  });
  it('should strip comments in function declarations', () => {
    expect.assertions(3);
    const g = new AsyncGraph();
    g.value('x', 1);
    g.functionAsync('xToString', function (x) {
      return Promise.resolve(x + '');
    });
    g.functionAsync('xIsOdd', (/** @number */ x) =>
      Promise.resolve(x % 2 == 1)
    );
    return g.entryPoint((
      /** @number */ x,
      /** @boolean **/ xIsOdd /** @string*/,
      xToString
    ) => {
      expect(xToString).toBe('1');
      expect(x).toBe(1);
      expect(xIsOdd).toBe(true);
    });
  });
  it('should resolve data value with primitive', () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    g.value('foo', 1);
    return g.entryPoint(function (foo) {
      expect(foo).toBe(1);
    });
  });
  it('should throw if data dependency not defined', () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    g.value('foo', 1);
    try {
      g.entryPoint(function (bar) {
        fail();
      });
    } catch (e) {
      expect(e.message).toEqual(`Node 'bar' was not found in graph.`);
    }
  });
  it('should resolve data value with same object', () => {
    const g = new AsyncGraph();
    const originalObject = {
      id: 123,
      phone: 911,
    };
    g.value('bar', originalObject);
    return g.entryPoint(function (bar) {
      expect(bar).toBe(originalObject);
    });
  });
  it('should resolve multiple data values independent of registration order', () => {
    const g = new AsyncGraph();
    g.value('age', 1337);
    g.value('name', 'Tuan');
    g.value('data', {
      id: 123,
      phone: 911,
    });
    return g.entryPoint(function (name, data, age) {
      expect(age).toBe(1337);
      expect(name).toBe('Tuan');
      expect(data).toEqual({
        phone: 911,
        id: 123,
      });
    });
  });
  it('should resolve async function', () => {
    const g = new AsyncGraph();
    g.value('jwt', 1);
    g.functionAsync('account', function (jwt) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve({ id: jwt });
        }, DELAY_MILLIS);
      });
    });
    return g.entryPoint(function (account) {
      expect(account).toEqual({
        id: 1,
      });
    });
  });
  it('should resolve no-arg async function', () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    g.functionAsync('x', function () {
      return Promise.resolve(1);
    });
    return g.entryPoint(x => {
      expect(x).toBe(1);
    });
  });
  it('should resolve function declared in variable', () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    g.value('x', 1);
    const f = function (x) {
      return Promise.resolve(x + 1);
    };
    g.functionAsync('y', f);
    return g.entryPoint(y => {
      expect(y).toBe(2);
    });
  });
  it('should resolve functions in their lexical closure', () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    g.value('x', 1);
    const y = 2;
    const f = function (x) {
      return Promise.resolve(x + y);
    };
    g.functionAsync('y', f);
    return g.entryPoint(y => {
      expect(y).toBe(3);
    });
  });
  it('should throw if async function references non-existent dependency', () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    g.functionAsync('account', function (jwt) {
      return Promise.resolve(123);
    });
    try {
      g.entryPoint(function (account) {
        fail();
      });
    } catch (e) {
      expect(e.message).toBe(`Node 'jwt' was not found in graph.`);
    }
  });
  it('should resolve async function with nodes registered out of order', () => {
    const g = new AsyncGraph();
    g.functionAsync('account', function (jwt) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve({ id: jwt });
        }, DELAY_MILLIS);
      });
    });
    g.value('jwt', 1);
    return g.entryPoint(function (account) {
      expect(account).toEqual({
        id: 1,
      });
    });
  });
  it('should resolve async function that depends on async function', () => {
    const g = new AsyncGraph();
    g.value('jwt', 1);
    g.functionAsync('account', function (jwt) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve({ id: jwt });
        }, DELAY_MILLIS);
      });
    });
    g.functionAsync('campaign', function (account) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve({
            id: 123,
            accountId: account.id,
          });
        }, DELAY_MILLIS);
      });
    });
    return g.entryPoint(function (campaign) {
      expect(campaign).toEqual({
        id: 123,
        accountId: 1,
      });
    });
  });
  it('should detect a cycle with distance 2', () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    g.functionAsync('chicken', function (egg) {
      return Promise.resolve('Cluck');
    });
    g.functionAsync('egg', function (chicken) {
      return Promise.resolve('...');
    });
    try {
      return g.entryPoint(function (egg) {
        fail();
      });
    } catch (e) {
      expect(e.message).toBe(
        `Node 'chicken' depends on 'egg' which is actually` +
          ' an ancestor: root->egg->chicken->egg'
      );
    }
  });
  it('should detect a long cycle', () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    g.functionAsync('google', function (goobuntu) {
      return Promise.resolve();
    });
    g.functionAsync('goobuntu', function (ubuntu) {
      return Promise.resolve();
    });
    g.functionAsync('ubuntu', function (linuxKernel) {
      return Promise.resolve();
    });
    g.functionAsync('linuxKernel', function (gcc) {
      return Promise.resolve();
    });
    g.functionAsync('gcc', function (glibc) {
      return Promise.resolve();
    });
    g.functionAsync('glibc', function (c) {
      return Promise.resolve();
    });
    g.functionAsync('c', function (dennisRitchie, kenThompson) {
      return Promise.resolve();
    });
    g.value('unix', 0);
    g.functionAsync('kenThompson', function (goobuntu) {
      return Promise.resolve();
    });
    g.functionAsync('dennisRitchie', function (unix) {
      return Promise.resolve();
    });
    try {
      return g.entryPoint(function (google) {
        fail();
      });
    } catch (e) {
      expect(e.message).toBe(
        `Node 'kenThompson' depends on 'goobuntu' which is` +
          ' actually an ancestor: root->google->goobuntu->ubuntu->' +
          'linuxKernel->gcc->glibc->c->kenThompson->goobuntu'
      );
    }
  });
  it('should resolve async function and async function it depends on', () => {
    const g = new AsyncGraph();
    g.value('jwt', 1);
    g.functionAsync('account', function (jwt) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve({ id: jwt });
        }, DELAY_MILLIS);
      });
    });
    g.functionAsync('campaign', function (account) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve({
            id: 123,
            accountId: account.id,
          });
        }, DELAY_MILLIS);
      });
    });
    return g.entryPoint(function (campaign, account) {
      expect(account).toEqual({
        id: 1,
      });
      expect(campaign).toEqual({
        id: 123,
        accountId: 1,
      });
    });
  });
  it('should resolve async function and async function that depends on it', () => {
    const g = new AsyncGraph();
    g.value('jwt', 1);
    g.functionAsync('account', function (jwt) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve({ id: jwt });
        }, DELAY_MILLIS);
      });
    });
    g.functionAsync('campaign', function (account) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve({
            id: 123,
            accountId: account.id,
          });
        }, DELAY_MILLIS);
      });
    });
    return g.entryPoint(function (account, campaign) {
      expect(account).toEqual({
        id: 1,
      });
      expect(campaign).toEqual({
        id: 123,
        accountId: 1,
      });
    });
  });
  it('should reject if async function throws', () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    g.value('jwt', 1);
    g.functionAsync('campaign', function (jwt) {
      throw new Error('Foo');
    });
    return g
      .entryPoint(function (campaign) {
        fail();
      })
      .catch(e => {
        expect(e).toEqual(
          new Error(
            `Error on path root->campaign. ` +
              `call campaign(jwt=1) threw error: (Error: Foo)`
          )
        );
      });
  });
  it('should reject if async function returns rejected Promise', () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    g.value('jwt', 1);
    g.functionAsync('campaign', function (jwt) {
      return Promise.resolve().then(() => {
        throw new Error('Foo');
      });
    });
    return g
      .entryPoint(function (campaign) {
        fail();
      })
      .catch(e => {
        expect(e).toEqual(
          new Error(
            `Error on path root->campaign. ` +
              `call campaign(jwt=1) ` +
              `returned Promise rejected with (Error: Foo)`
          )
        );
      });
  });
  it('should wrap in promise if Function produces a value that is not a Promise', () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    g.value('x', 1);
    g.functionAsync('y', function (x) {
      return x + 1;
    });
    return g.entryPoint(function (y) {
      expect(y).toBe(2);
    });
  });
  it('should give precedence to missing node error if async function throws', () => {
    expect.assertions(1);
    const g = new AsyncGraph();
    g.functionAsync('campaign', function (jw) {
      throw new Error('Foo');
    });
    try {
      g.entryPoint(function (campaign) {
        fail();
      }).catch(e => {
        fail();
      });
    } catch (e) {
      expect(e.message).toBe(`Node 'jw' was not found in graph.`);
    }
  });
  it('should resolve async functions with shared data dependency', () => {
    const g = new AsyncGraph();
    g.value('num', 10);
    g.functionAsync('double', function (num) {
      return Promise.resolve(num * 2);
    });
    g.functionAsync('half', function (num) {
      return Promise.resolve(num / 2);
    });
    return g.entryPoint(function (double, half) {
      expect(double).toEqual(20);
      expect(half).toEqual(5);
    });
  });
  it('should invoke async function node once per execution', () => {
    expect.assertions(5);
    let bCount = 0;
    let cCount = 0;
    const g = new AsyncGraph();
    g.value('a', 2);
    g.functionAsync('b', function (a) {
      bCount++;
      return Promise.resolve(3 * a);
    });
    g.functionAsync('c', function (b) {
      cCount++;
      return Promise.resolve(5 * b);
    });
    const executionA = g.entryPoint(function (b, c) {
      expect(b).toBe(3 * 2);
      expect(c).toBe(5 * (3 * 2));
    });
    const executionB = g.entryPoint(function (b) {
      expect(b).toBe(3 * 2);
    });
    return Promise.all([executionA, executionB]).then(() => {
      expect(bCount).toBe(2);
      expect(cCount).toBe(1);
    });
  });
  it('should resolve async functions with shared async function dependency', () => {
    const executions = 2;
    const expectations = 3;
    expect.assertions(executions * expectations);
    const g = new AsyncGraph();
    g.value('num', 10);
    g.functionAsync('add2', function (num) {
      return Promise.resolve(num + 2);
    });
    g.functionAsync('double', function (add2) {
      return Promise.resolve(add2 * 2);
    });
    g.functionAsync('half', function (add2) {
      return Promise.resolve(add2 / 2);
    });
    const executionA = g.entryPoint(function (add2, double, half) {
      expect(add2).toEqual(12);
      expect(double).toEqual(24);
      expect(half).toEqual(6);
    });
    const executionB = g.entryPoint(function (double, add2, half) {
      expect(add2).toEqual(12);
      expect(double).toEqual(24);
      expect(half).toEqual(6);
    });
    return Promise.all([executionA, executionB]);
  });
  it('should resolve permutations of bcd with g: d->c, c->b, b->a', () => {
    const permutations = 6;
    const expectsPerPermutation = 3;
    expect.assertions(expectsPerPermutation * permutations);
    const g = new AsyncGraph();
    g.value('a', 2);
    g.functionAsync('b', function (a) {
      return Promise.resolve(3 * a);
    });
    g.functionAsync('c', function (b) {
      return Promise.resolve(5 * b);
    });
    g.functionAsync('d', function (c) {
      return Promise.resolve(7 * c);
    });
    const expectedB = 3 * 2;
    const expectedC = 5 * (3 * 2);
    const expectedD = 7 * (5 * 3 * 2);
    const bcd = g.entryPoint(function (b, c, d) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    const bdc = g.entryPoint(function (b, d, c) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    const cbd = g.entryPoint(function (c, b, d) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    const cdb = g.entryPoint(function (c, d, b) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    const dbc = g.entryPoint(function (d, b, c) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    const dcb = g.entryPoint(function (d, c, b) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    return Promise.all([bcd, bdc, cbd, cdb, dbc, dcb]);
  });
  it('should resolve permutations of bcd with graph d->[b, c], c->b, b->a', () => {
    expect.assertions(3 * 6);
    const g = new AsyncGraph();
    g.value('a', 2);
    g.functionAsync('b', function (a) {
      return Promise.resolve(3 * a);
    });
    g.functionAsync('c', function (b) {
      return Promise.resolve(5 * b);
    });
    g.functionAsync('d', function (b, c) {
      return Promise.resolve(7 * b * c);
    });
    const expectedB = 3 * 2;
    const expectedC = 5 * (3 * 2);
    const expectedD = 7 * (5 * 3 * 2) * (3 * 2);
    const bcd = g.entryPoint(function (b, c, d) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    const bdc = g.entryPoint(function (b, d, c) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    const cbd = g.entryPoint(function (c, b, d) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    const cdb = g.entryPoint(function (c, d, b) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    const dbc = g.entryPoint(function (d, b, c) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    const dcb = g.entryPoint(function (d, c, b) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    return Promise.all([bcd, bdc, cbd, cdb, dbc, dcb]);
  });
  it('should resolve permutations of bcd with graph d->[c, b], c->b, b->a', () => {
    expect.assertions(3 * 6);
    const g = new AsyncGraph();
    g.value('a', 2);
    g.functionAsync('b', function (a) {
      return Promise.resolve(3 * a);
    });
    g.functionAsync('c', function (b) {
      return Promise.resolve(5 * b);
    });
    g.functionAsync('d', function (c, b) {
      return Promise.resolve(7 * b * c);
    });
    const expectedB = 3 * 2;
    const expectedC = 5 * (3 * 2);
    const expectedD = 7 * (5 * 3 * 2) * (3 * 2);
    const bcd = g.entryPoint(function (b, c, d) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    const bdc = g.entryPoint(function (b, d, c) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    const cbd = g.entryPoint(function (c, b, d) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    const cdb = g.entryPoint(function (c, d, b) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    const dbc = g.entryPoint(function (d, b, c) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    const dcb = g.entryPoint(function (d, c, b) {
      expect(b).toEqual(expectedB);
      expect(c).toEqual(expectedC);
      expect(d).toEqual(expectedD);
    });
    return Promise.all([bcd, bdc, cbd, cdb, dbc, dcb]);
  });
  test.todo('should support configuring delay between nodes');
  test.todo('should support node retry to smooth over transient errors');
  test.todo('should reject with path leading up tonode failure');
  test.todo('should fail because of global timeout');
  test.todo('should dump debug information for failure');
  test.todo('should create copy of object values before injecting');
  test.todo('should error if destructuring parameter arguments');
  // TODO: consider not allowing nodes registered out of order,
  //     complain if dependency not yet registered. This also allows easy
  //     enforcement of cycle detection, and that graph is an D.A.G.
  // TODO: consider pruning library interace. remove data node, and let
  //     all nodes be async functions. The base case would be a function
  //     that has no dependencies.
});

import test, { Test } from "tape-promise/tape";
import { Container } from "dockerode";
import { StellarTestLedger } from "../../../../../main/typescript/public-api";
import { SupportedImageVersions } from "../../../../../main/typescript/stellar/stellar-test-ledger";

test("constructor throws if invalid input is provided", (assert: Test) => {
  assert.ok(StellarTestLedger);
  assert.throws(
    () =>
      new StellarTestLedger({
        containerImageVersion: "nope" as unknown as SupportedImageVersions,
      }),
  );
  assert.end();
});

test("constructor does not throw if valid input is provided", (assert: Test) => {
  assert.ok(StellarTestLedger);
  assert.doesNotThrow(() => new StellarTestLedger());
  assert.end();
});

test("starts/stops/destroys a docker container", async (assert: Test) => {
  const stellarTestLedger = new StellarTestLedger();
  test.onFinish(async () => {
    await stellarTestLedger.stop();
    await stellarTestLedger.destroy();
  });

  const container: Container = await stellarTestLedger.start();
  assert.ok(container);

  assert.end();
});

import assert from "node:assert/strict";

export async function smokeWorkerRuntime(baseUrl: string) {
  const signIn = await fetch(new URL("/auth/signin", baseUrl), { redirect: "manual" });
  assert.equal(signIn.status, 200, "public sign-in page did not render");
  const signInBody = await signIn.text();
  assert.match(signInBody, /<title>Sign in<\/title>/, "public sign-in page marker is missing");
  assert.match(signInBody, /action="\/api\/auth\/signin"/, "application sign-in form marker is missing");

  const protectedResponse = await fetch(new URL("/grow-logs", baseUrl), { redirect: "manual" });
  assert(
    protectedResponse.status >= 300 && protectedResponse.status < 400,
    "protected unauthenticated request did not redirect",
  );
  assert.equal(
    new URL(protectedResponse.headers.get("location") ?? "", baseUrl).pathname,
    "/auth/signin",
    "protected unauthenticated request did not use the application sign-in redirect",
  );

  process.stdout.write(
    "Built Worker runtime smoke passed: public sign-in rendered and the protected route used the application redirect. Local workerd evidence only.\n",
  );
}

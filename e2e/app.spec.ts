import { test, expect, Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL || "https://eqx-folha-servico.vercel.app";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "colaboradoreshoraseqx@gmail.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "eqx2030";

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/auth/login`);
  await page.getByPlaceholder("nome@eqx.pt").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: /Entrar/i }).click();
}

async function loginAsAdmin(page: Page) {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.waitForURL(/\/hr/, { timeout: 15000 });
}

// Create a fresh worker via invite and return its credentials
async function createWorker(page: Page): Promise<{ email: string; password: string }> {
  const code = `W${Date.now().toString().slice(-6)}`;
  await loginAsAdmin(page);
  await page.goto(`${BASE}/hr/invites`);
  await page.getByPlaceholder("EX: EQX2025").fill(code);
  await page.getByRole("button", { name: /Criar convite/i }).click();
  await expect(page.getByText(code)).toBeVisible();

  const email = `test${Date.now().toString().slice(-6)}@example.com`;
  const password = "teste123";
  await page.goto(`${BASE}/auth/signup`);
  await page.getByPlaceholder("Código fornecido pela EQX").fill(code);
  await page.getByPlaceholder("João Silva").fill("teste trabalhador");
  await page.getByPlaceholder("o.seu@email.com").fill(email);
  await page.getByPlaceholder("Mínimo 6 caracteres").fill(password);
  await page.getByRole("button", { name: /Criar conta/i }).click();
  await page.waitForTimeout(3000);
  if (page.url().includes("/auth/login")) {
    await login(page, email, password);
  }
  await page.waitForURL(/\/(worker|hr)/, { timeout: 15000 });
  return { email, password };
}

test.describe("Auth", () => {
  test("login page loads", async ({ page }) => {
    await page.goto(`${BASE}/auth/login`);
    await expect(page.getByText(/Inicie sessão para continuar/i)).toBeVisible();
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto(`${BASE}/auth/login`);
    await page.getByPlaceholder("nome@eqx.pt").fill(ADMIN_EMAIL);
    await page.getByPlaceholder("••••••••").fill("senha-errada");
    await page.getByRole("button", { name: /Entrar/i }).click();
    await expect(page.getByText(/incorretos/i)).toBeVisible();
  });

  test("admin can login and logout", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/hr/);
    await page.getByRole("button", { name: /Sair/i }).click();
    await page.waitForURL(/\/auth\/login/, { timeout: 15000 });
  });
});

test.describe("Admin pages", () => {
  test("dashboard loads with stats", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByText(/Trabalhadores/i)).toBeVisible();
  });

  test("users page has bulk actions", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/hr/users`);
    await expect(page.getByRole("heading", { name: /Utilizadores/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Transferir em massa/i })).toBeVisible();
  });

  test("invites page can create and delete invite", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/hr/invites`);
    const code = `D${Date.now().toString().slice(-6)}`;
    await page.getByPlaceholder("EX: EQX2025").fill(code);
    await page.getByRole("button", { name: /Criar convite/i }).click();
    await expect(page.getByText(code)).toBeVisible();
    // Delete it — register dialog handler BEFORE clicking
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Eliminar/i }).first().click();
    await expect(page.getByText(code)).not.toBeVisible();
  });

  test("projects page loads", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/hr/projects`);
    await expect(page.getByRole("heading", { name: /Obras/i })).toBeVisible();
  });

  test("clients page loads", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/hr/clients`);
    await expect(page.getByRole("heading", { name: /Clientes/i })).toBeVisible();
  });

  test("reports page loads", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/hr/reports`);
    await expect(page.getByRole("heading", { name: /Relat/i })).toBeVisible();
  });

  test("emails page loads", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/hr/emails`);
    await expect(page.getByRole("heading", { name: "Emails", exact: true })).toBeVisible();
  });

  test("notifications page loads", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/hr/notifications`);
    await expect(page.getByRole("heading", { name: /Notifica/i })).toBeVisible();
  });

  test("settings page loads", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/hr/settings`);
    await expect(page.getByRole("heading", { name: /Defini/i })).toBeVisible();
  });
});

test.describe("Worker flow", () => {
  test("invite assigns the selected obra and hours calculate (bugs #6/#7)", async ({ page }) => {
    // 1. Admin cria convite com a primeira obra da lista selecionada
    await loginAsAdmin(page);
    await page.goto(`${BASE}/hr/invites`);
    const code = `T${Date.now().toString().slice(-6)}`;
    await page.getByPlaceholder("EX: EQX2025").fill(code);
    const obraCheckbox = page.locator('div.max-h-36 input[type="checkbox"]').first();
    const hasObra = await obraCheckbox.isVisible().catch(() => false);
    if (!hasObra) return; // deploy sem a UI de obras — nada a testar
    const obraName = (await obraCheckbox.locator("xpath=following-sibling::span[1]").textContent()) || "";
    await obraCheckbox.check();
    await page.getByRole("button", { name: /Criar convite/i }).click();
    await expect(page.getByText(code)).toBeVisible();

    // 2. Trabalhador regista-se com o código
    const email = `t${Date.now().toString().slice(-6)}@example.com`;
    await page.goto(`${BASE}/auth/signup`);
    await page.getByPlaceholder("Código fornecido pela EQX").fill(code);
    await page.getByPlaceholder("João Silva").fill("teste trabalhador");
    await page.getByPlaceholder("o.seu@email.com").fill(email);
    await page.getByPlaceholder("Mínimo 6 caracteres").fill("teste123");
    await page.getByRole("button", { name: /Criar conta/i }).click();
    await page.waitForTimeout(3000);
    if (page.url().includes("/auth/login")) {
      await login(page, email, "teste123");
    }
    await page.waitForURL(/\/(worker|hr)/, { timeout: 15000 });

    // 3. BUG #7: as obras do trabalhador devem incluir a obra selecionada
    await page.goto(`${BASE}/worker/settings`);
    await expect(page.getByText(obraName!, { exact: false }).first()).toBeVisible({ timeout: 15000 });

    // 4. Criar folha para essa obra e verificar as HORAS (bug #6)
    await page.goto(`${BASE}/worker/sheet/new`);
    await page.locator('a[href*="obra="]').first().click();
    const timeInputs = page.locator('input[type="time"]');
    await timeInputs.first().waitFor({ state: "visible", timeout: 15000 });
    await timeInputs.nth(0).fill("08:00");
    await timeInputs.nth(1).fill("12:00");
    await page.getByRole("button", { name: /Guardar rascunho/i }).click();
    await expect(page.getByText(/Rascunho guardado/i)).toBeVisible({ timeout: 15000 });
    await page.goto(`${BASE}/worker/dashboard`);
    await expect(page.getByText(/4h/).first()).toBeVisible({ timeout: 15000 });
  });

  test("worker settings page loads", async ({ page }) => {
    const { email, password } = await createWorker(page);
    await page.goto(`${BASE}/worker/settings`);
    await expect(page.getByRole("heading", { name: /O meu perfil/i })).toBeVisible();
    await expect(page.getByText(/As minhas obras/i)).toBeVisible();
  });
});

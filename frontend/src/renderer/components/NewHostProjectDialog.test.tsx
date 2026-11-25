import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteHost } from "../hooks/useRemoteHosts";
import { NEW_HOST_PROJECT_CREATE_ID_PREFIX, NewHostProjectDialog, newHostProjectCreateId, validHostProjectName } from "./NewHostProjectDialog";

const mocks = vi.hoisted(() => ({ post: vi.fn(), navigate: vi.fn(), clientHost: [] as string[] }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("../lib/host-clients", async (importOriginal) => ({
	...(await importOriginal<typeof import("../lib/host-clients")>()),
	clientForHost: (hostId: string) => {
		mocks.clientHost.push(hostId);
		return { POST: mocks.post };
	},
}));

const atlas: RemoteHost = { hostId: "atlas", label: "AO-Atlas", url: "https://atlas.test", status: "connected" };

function renderDialog(hosts: RemoteHost[] = [atlas], onOpenChange = vi.fn()) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	render(<QueryClientProvider client={queryClient}><NewHostProjectDialog open onOpenChange={onOpenChange} hosts={hosts} /></QueryClientProvider>);
	return { onOpenChange };
}

beforeEach(() => {
	mocks.post.mockReset();
	mocks.navigate.mockReset();
	mocks.clientHost = [];
});
afterEach(cleanup);

describe("NewHostProjectDialog", () => {
	it("checks folder names", () => {
		expect(validHostProjectName("my-project_2.0")).toBe(true);
		expect(validHostProjectName("")).toBe(false);
		expect(validHostProjectName("-x")).toBe(false);
		expect(validHostProjectName("a/b")).toBe(false);
		expect(validHostProjectName("..")).toBe(false);
		expect(validHostProjectName("a".repeat(65))).toBe(false);
		expect(newHostProjectCreateId()).toMatch(new RegExp(`^${NEW_HOST_PROJECT_CREATE_ID_PREFIX}[a-z0-9]{12}$`));
	});

	it("makes /AO/projects/<name> on the host, adds it, and opens the project", async () => {
		mocks.post.mockImplementation(async (path: string) => path === "/api/v1/projects/initialize"
			? { data: { status: "ok" } }
			: { data: { project: { id: "p-new" } } });
		const { onOpenChange } = renderDialog();

		const input = screen.getByRole("textbox", { name: "Project name" });
		fireEvent.change(input, { target: { value: "acme-portal" } });
		expect(screen.getByText("Creates /AO/projects/acme-portal on AO-Atlas")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Create project" }));

		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({
			to: "/host/$hostId/project/$projectId",
			params: { hostId: "atlas", projectId: "p-new" },
		}));
		expect(mocks.clientHost.every((host) => host === "atlas")).toBe(true);
		const [initPath, initBody] = mocks.post.mock.calls[0]!;
		expect(initPath).toBe("/api/v1/projects/initialize");
		expect(initBody.body).toMatchObject({ path: "/AO/projects/acme-portal", create: true });
		expect(initBody.body.createId.startsWith(NEW_HOST_PROJECT_CREATE_ID_PREFIX)).toBe(true);
		expect(mocks.post.mock.calls[1]).toEqual(["/api/v1/projects", { body: { path: "/AO/projects/acme-portal" } }]);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("refuses a bad name and shows the host's error", async () => {
		mocks.post.mockResolvedValue({ error: { error: { code: "PATH_EXISTS", message: "A folder with this name already exists." } } });
		renderDialog();
		const input = screen.getByRole("textbox", { name: "Project name" });
		fireEvent.change(input, { target: { value: "bad/name" } });
		expect((screen.getByRole("button", { name: "Create project" }) as HTMLButtonElement).disabled).toBe(true);
		fireEvent.change(input, { target: { value: "taken" } });
		fireEvent.click(screen.getByRole("button", { name: "Create project" }));
		expect(await screen.findByRole("alert")).toBeTruthy();
		expect(mocks.post).toHaveBeenCalledTimes(1);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	it("waits for a connected host", () => {
		renderDialog([{ ...atlas, status: "offline" }]);
		fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), { target: { value: "x" } });
		expect(screen.getByText("Connect to your AO-Atlas host first.")).toBeTruthy();
		expect((screen.getByRole("button", { name: "Create project" }) as HTMLButtonElement).disabled).toBe(true);
	});
});

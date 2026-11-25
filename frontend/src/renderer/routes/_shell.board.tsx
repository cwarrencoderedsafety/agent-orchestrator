import { createFileRoute } from "@tanstack/react-router";
import { SessionsBoard } from "../components/SessionsBoard";

// The board across every local project: SessionsBoard with no projectId
// scopes to all workspaces and leaves out the project-only actions.
export const Route = createFileRoute("/_shell/board")({
	component: AllProjectsBoardRoute,
});

function AllProjectsBoardRoute() {
	return <SessionsBoard />;
}

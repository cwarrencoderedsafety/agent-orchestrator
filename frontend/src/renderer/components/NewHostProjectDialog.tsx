import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { RemoteHost } from "../hooks/useRemoteHosts";
import { remoteWorkspaceQueryKey } from "../hooks/useWorkspaceQuery";
import { apiErrorException } from "../lib/api-error-exception";
import { clientForHost } from "../lib/host-clients";
import { projectNavigateTarget } from "../lib/navigate-to-session";
import { Button } from "./ui/button";
import { CloseButton } from "./ui/close-button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	settingsDialogBodyClass,
	settingsDialogContentClass,
	settingsDialogHeaderClass,
} from "./ui/dialog";
import { Input } from "./ui/input";

/** Where new projects go on a self-hosted host (the AO-Atlas layout). */
export const HOST_PROJECTS_ROOT = "/AO/projects";
/** Projects this dialog makes carry a createId with this prefix. The host's
 * auto-setup timer applies the standard settings to them and starts their
 * orchestrator; projects added any other way are only given the settings. */
export const NEW_HOST_PROJECT_CREATE_ID_PREFIX = "mg-new-";
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function validHostProjectName(name: string): boolean {
	return NAME_PATTERN.test(name) && name !== "." && name !== "..";
}

export function newHostProjectCreateId(random: () => number = Math.random): string {
	return NEW_HOST_PROJECT_CREATE_ID_PREFIX + Array.from({ length: 12 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)]).join("");
}

type CreateArgs = { hostId: string; name: string };

/**
 * One-step "New project" for a self-hosted host: asks only for a name, makes
 * /AO/projects/<name> on that host as a new Git repository with a first
 * commit, and adds it as a project. The host gives it the standard settings.
 */
export function NewHostProjectDialog({
	open,
	onOpenChange,
	hosts,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	hosts: readonly RemoteHost[];
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const connected = hosts.filter((host) => host.status === "connected");
	const [name, setName] = useState("");
	const [chosenHostId, setChosenHostId] = useState<string>();
	const hostId = chosenHostId && connected.some((host) => host.hostId === chosenHostId) ? chosenHostId : connected[0]?.hostId;
	const trimmed = name.trim();
	const nameOk = validHostProjectName(trimmed);

	const create = useMutation({
		mutationFn: async ({ hostId: target, name: projectName }: CreateArgs) => {
			const client = clientForHost(target);
			const path = `${HOST_PROJECTS_ROOT}/${projectName}`;
			const init = await client.POST("/api/v1/projects/initialize", {
				body: { path, create: true, createId: newHostProjectCreateId() },
			});
			if (init.error) throw apiErrorException(init.error, t("newHostProject.failed"));
			const added = await client.POST("/api/v1/projects", { body: { path } });
			const projectId = added.error ? undefined : added.data?.project.id;
			if (!projectId) throw apiErrorException(added.error, t("newHostProject.failed"));
			return { hostId: target, projectId };
		},
		onSuccess: async ({ hostId: target, projectId }) => {
			await queryClient.invalidateQueries({ queryKey: remoteWorkspaceQueryKey(target) });
			onOpenChange(false);
			setName("");
			void navigate(projectNavigateTarget(projectId, target));
		},
	});

	const error = create.error instanceof Error ? create.error.message : undefined;
	return (
		<Dialog open={open} onOpenChange={(next) => { if (!create.isPending) { create.reset(); onOpenChange(next); } }}>
			<DialogContent
				showCloseButton={false}
				className={cn(settingsDialogContentClass, "w-[min(480px,calc(100vw-24px))]")}
				data-new-host-project-dialog
			>
				<DialogClose asChild>
					<CloseButton floating aria-label={t("confirm.close")} />
				</DialogClose>
				<div className={cn(settingsDialogHeaderClass, "border-b-0 p-5 pr-12")}>
					<DialogTitle className="settings-dialog-title text-base">{t("newHostProject.title")}</DialogTitle>
					<DialogDescription className="text-control leading-5 text-settings-muted">{t("newHostProject.description")}</DialogDescription>
				</div>
				<form
					className={cn(settingsDialogBodyClass, "gap-3 px-5 pt-0 pb-5")}
					onSubmit={(event) => {
						event.preventDefault();
						if (hostId && nameOk && !create.isPending) create.mutate({ hostId, name: trimmed });
					}}
				>
					{connected.length > 1 ? (
						<select
							aria-label={t("newHostProject.host")}
							className="h-8 rounded-md border border-border bg-transparent px-2 text-control"
							value={hostId}
							onChange={(event) => setChosenHostId(event.target.value)}
						>
							{connected.map((host) => <option key={host.hostId} value={host.hostId}>{host.label}</option>)}
						</select>
					) : null}
					<Input
						autoFocus
						value={name}
						onChange={(event) => setName(event.target.value)}
						aria-label={t("newHostProject.name")}
						placeholder={t("newHostProject.placeholder")}
						data-new-host-project-name
					/>
					<p className="text-caption leading-4 text-settings-muted" data-new-host-project-path>
						{hostId
							? t("newHostProject.willCreate", { path: `${HOST_PROJECTS_ROOT}/${trimmed || "…"}`, host: connected.find((host) => host.hostId === hostId)?.label ?? hostId })
							: t("newHostProject.noHost")}
					</p>
					{trimmed && !nameOk ? <p role="alert" className="text-caption leading-4 text-error">{t("newHostProject.badName")}</p> : null}
					{error ? <p role="alert" className="text-caption leading-4 text-error">{error}</p> : null}
					<Button type="submit" variant="primary" className="self-end" disabled={!hostId || !nameOk || create.isPending}>
						{create.isPending ? t("newHostProject.creating") : t("newHostProject.create")}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}

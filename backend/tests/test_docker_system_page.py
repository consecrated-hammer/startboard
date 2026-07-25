from app.routes.admin import _system_page_groups


def _workload(key: str, title: str, status: str, group_hint: str | None = None) -> dict:
    return {
        "key": key,
        "title": title,
        "group_hint": group_hint,
        "docker_status": {"status": status},
    }


def test_system_page_groups_running_workloads_by_homepage_label():
    groups = _system_page_groups(
        [
            _workload("radarr", "Radarr", "healthy", "Media"),
            _workload("sonarr", "Sonarr", "running", "Media"),
            _workload("traefik", "Traefik", "running", "Infrastructure"),
            _workload("unlabelled", "Unlabelled", "running"),
            _workload("stopped", "Stopped", "stopped", "Media"),
            _workload("unhealthy", "Unhealthy", "unhealthy", "Media"),
        ]
    )

    assert [(group["title"], [item["key"] for item in group["workloads"]]) for group in groups] == [
        ("Infrastructure", ["traefik"]),
        ("Media", ["radarr", "sonarr"]),
        ("Other Docker services", ["unlabelled"]),
    ]


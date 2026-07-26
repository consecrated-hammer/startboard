from app.services.docker_system_page import _group_workloads


def _workload(key: str, title: str, status: str, group_hint: str | None = None) -> dict:
    return {
        "key": key,
        "title": title,
        "group_hint": group_hint,
        "docker_status": {"status": status},
    }


def test_system_page_groups_all_reported_workloads_by_homepage_label():
    grouped = _group_workloads(
        [
            _workload("radarr", "Radarr", "healthy", "Media"),
            _workload("sonarr", "Sonarr", "running", "Media"),
            _workload("traefik", "Traefik", "running", "Infrastructure"),
            _workload("unlabelled", "Unlabelled", "running"),
            _workload("stopped", "Stopped", "stopped", "Media"),
            _workload("unhealthy", "Unhealthy", "unhealthy", "Media"),
        ]
    )

    assert {title: sorted(item["key"] for item in workloads) for title, workloads in grouped.items()} == {
        "Infrastructure": ["traefik"],
        "Media": ["radarr", "sonarr", "stopped", "unhealthy"],
        "Other Docker services": ["unlabelled"],
    }

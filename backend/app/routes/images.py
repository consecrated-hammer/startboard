"""Managed image library routes."""

from starlette.datastructures import UploadFile as StarletteUploadFile
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import Response

from app.deps import require_user
from app.services.managed_images import (
    bulk_action,
    clear_variants,
    delete_images,
    get_owner_image,
    image_stats,
    list_images,
    list_owner_pages,
    original_image_bytes,
    render_image_bytes,
    reorder_images,
    replace_page_assignments,
    set_page_assignment,
    store_uploads,
    update_image,
)
from app.db.database import get_db_connection

router = APIRouter(prefix="/images", tags=["images"])


@router.get("")
def get_images(user: dict = Depends(require_user)):
    return {
        "images": list_images(user["id"]),
        "pages": list_owner_pages(user["id"]),
    }


@router.get("/stats")
def get_stats(user: dict = Depends(require_user)):
    return image_stats(user["id"])


@router.post("/upload")
async def upload_images(request: Request, user: dict = Depends(require_user)):
    form = await request.form()
    uploads = []
    for key, value in form.multi_items():
        if key == "images" and isinstance(value, (UploadFile, StarletteUploadFile)):
            uploads.append((value.filename or "image", value.content_type, await value.read()))
    if not uploads:
        raise HTTPException(status_code=400, detail="No files uploaded")
    return store_uploads(user["id"], uploads)


@router.patch("/{image_id}")
def patch_image(image_id: int, payload: dict, user: dict = Depends(require_user)):
    try:
        return update_image(
            user["id"],
            image_id,
            in_rotation=payload.get("in_rotation") if "in_rotation" in payload else None,
            favourite=payload.get("favourite") if "favourite" in payload else None,
            rotation_order=payload.get("rotation_order") if "rotation_order" in payload else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{image_id}/assignments")
def update_page_image_assignment(image_id: int, payload: dict, user: dict = Depends(require_user)):
    page_id = int(payload.get("page_id") or 0)
    mode = (payload.get("mode") or "").strip()
    if not page_id or not mode:
        raise HTTPException(status_code=400, detail="page_id and mode are required")
    try:
        return set_page_assignment(user["id"], image_id, page_id, mode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/pages/{page_id}/assignments")
def replace_page_image_assignments(page_id: int, payload: dict, user: dict = Depends(require_user)):
    single_image_id = payload.get("single_image_id")
    rotation_image_ids = [int(value) for value in (payload.get("rotation_image_ids") or [])]
    try:
        return replace_page_assignments(
            user["id"],
            page_id,
            single_image_id=int(single_image_id) if single_image_id else None,
            rotation_image_ids=rotation_image_ids,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/order")
def set_image_order(payload: dict, user: dict = Depends(require_user)):
    ordered_ids = [int(value) for value in (payload.get("orderedIds") or [])]
    if not ordered_ids:
        raise HTTPException(status_code=400, detail="orderedIds is required")
    try:
        return {"success": True, "images": reorder_images(user["id"], ordered_ids)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/bulk")
def image_bulk(payload: dict, user: dict = Depends(require_user)):
    ids = [int(value) for value in (payload.get("ids") or [])]
    action = payload.get("action")
    if not ids or not action:
        raise HTTPException(status_code=400, detail="ids and action are required")
    try:
        return bulk_action(user["id"], ids, action)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/cache/clear")
def clear_cache(payload: dict | None = None, user: dict = Depends(require_user)):
    image_ids = [int(value) for value in ((payload or {}).get("imageIds") or [])]
    if image_ids:
        for image_id in image_ids:
            with get_db_connection() as conn:
                row = get_owner_image(conn, user["id"], image_id)
            if row is not None:
                clear_variants(image_id)
    else:
        clear_variants()
    return {"success": True, "stats": image_stats(user["id"])}


@router.delete("/{image_id}")
def remove_image(image_id: int, user: dict = Depends(require_user)):
    delete_images(user["id"], [image_id])
    return {"success": True}


@router.get("/{image_id}/file")
def get_image_file(image_id: int, user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        row = get_owner_image(conn, user["id"], image_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Image not found")
        content, content_type = original_image_bytes(row)
        return Response(content=content, media_type=content_type)


@router.get("/{image_id}/render")
def render_image(image_id: int, w: int, h: int, position: str = "center", user: dict = Depends(require_user)):
    with get_db_connection() as conn:
        row = get_owner_image(conn, user["id"], image_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Image not found")
        if position not in {"center", "east", "west", "north", "south", "northwest"}:
            raise HTTPException(status_code=400, detail="Invalid render position")
        content, content_type = render_image_bytes(row, int(w), int(h), position)
        return Response(content=content, media_type=content_type)

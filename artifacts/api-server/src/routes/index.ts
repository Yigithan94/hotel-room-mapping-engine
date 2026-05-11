import { Router, type IRouter } from "express";
import healthRouter from "./health";
import hotelsRouter from "./hotels";
import roomsRouter from "./rooms";
import mappingsRouter from "./mappings";
import suppliersRouter from "./suppliers";
import statsRouter from "./stats";
import importRoomsRouter from "./importRooms";

const router: IRouter = Router();

router.use(healthRouter);
router.use(hotelsRouter);
router.use(roomsRouter);
router.use(mappingsRouter);
router.use(suppliersRouter);
router.use(statsRouter);
router.use(importRoomsRouter);

export default router;

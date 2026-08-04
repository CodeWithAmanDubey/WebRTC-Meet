"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const room_1 = require("../controllers/room");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
router.post('/', auth_1.authenticate, room_1.createRoom);
router.get('/:id', auth_1.authenticate, room_1.getRoom);
exports.default = router;

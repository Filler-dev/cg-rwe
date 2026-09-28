import "./styles/project.scss";
import "./components/icon/icon.js";
// The grid must be defined before the form, so that it is already listening
// when the form broadcasts its initial state.
import "./components/contrast_grid/contrast_grid.js";
import "./components/color_form/color_form.js";
import { qs } from "./scripts/dom.js";

qs("cg-color-form").start();

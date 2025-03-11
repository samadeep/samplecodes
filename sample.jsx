import React, { Component } from "react";
import { KatModal, KatLabel, KatInput, KatButton } from "@amzn/katal-react";
import axios from "axios";
import { POST_METHOD_TYPE } from "src/config/Constants";
import Ajv from "ajv";
import { apiService } from "src/service/AxiosApiService";
import "./PayloadEditorPopupStyle.css";

const { createCustomerSchemaValidator } = require("src/components/SIOTool/SchemaValidators/createCustomerPayload");
const { createCustomerPayload } = require("src/components/SIOTool/SAMPLE_PAYLOADS/CreateCustomerApiPayload");

const ajv = new Ajv();
const validator = ajv.compile(createCustomerSchemaValidator);

/** ✅ Function to set deeply nested values inside JSON */
function setDeepValue(obj, path, value) {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!current[key]) current[key] = {};
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
}

class PayloadEditorModalCustomer extends Component {
  constructor(props) {
    super(props);
    this.state = {
      formPayload: createCustomerPayload,
      rawPayload: JSON.stringify(createCustomerPayload, null, 2),
      error: null,
      history: [JSON.stringify(createCustomerPayload, null, 2)], // Track changes for undo
      historyIndex: 0, // Tracks undo/redo position
    };
    this.payloadDivRef = React.createRef();
  }

  /** ✅ Preserve Cursor Position */
  getCursorPosition = () => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    return { startOffset: range.startOffset, endOffset: range.endOffset };
  };

  setCursorPosition = (position) => {
    if (!position || !this.payloadDivRef.current) return;
    const range = document.createRange();
    const selection = window.getSelection();
    const node = this.payloadDivRef.current.firstChild;

    if (node) {
      const offset = Math.min(position.startOffset, node.length);
      range.setStart(node, offset);
      range.setEnd(node, offset);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  /** ✅ Handle JSON input changes while keeping cursor position */
  handleRawPayloadChange = () => {
    const cursorPosition = this.getCursorPosition();
    const content = this.payloadDivRef.current.innerText;

    this.setState(
      (prevState) => {
        const newHistory = prevState.history.slice(0, prevState.historyIndex + 1);
        newHistory.push(content);
        return {
          rawPayload: content,
          history: newHistory,
          historyIndex: newHistory.length - 1,
        };
      },
      () => {
        this.setCursorPosition(cursorPosition);
      }
    );

    try {
      const parsed = JSON.parse(content);
      this.setState({ formPayload: parsed, error: null });
    } catch {
      this.setState({ error: "Invalid JSON" });
    }
  };

  /** ✅ Undo (`Cmd + Z`) and Redo (`Cmd + Shift + Z`) Handling */
  handleUndoRedo = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "z") {
      event.preventDefault();

      this.setState((prevState) => {
        let newIndex = prevState.historyIndex;
        if (!event.shiftKey && prevState.historyIndex > 0) {
          // Undo (Cmd + Z)
          newIndex--;
        } else if (event.shiftKey && prevState.historyIndex < prevState.history.length - 1) {
          // Redo (Cmd + Shift + Z)
          newIndex++;
        }

        return {
          rawPayload: prevState.history[newIndex],
          historyIndex: newIndex,
        };
      }, () => {
        // Update the div with the new state
        if (this.payloadDivRef.current) {
          this.payloadDivRef.current.innerText = this.state.rawPayload;
        }
      });
    }
  };

  /** ✅ Attach & Detach Keyboard Event Listeners */
  componentDidMount() {
    document.addEventListener("keydown", this.handleUndoRedo);
  }

  componentWillUnmount() {
    document.removeEventListener("keydown", this.handleUndoRedo);
  }

  handleSubmit = async () => {
    try {
      const payloadToSend = JSON.parse(this.state.rawPayload);
      const valid = validator(payloadToSend);
      if (!valid) {
        this.setState({ error: "Validation error: " + ajv.errorsText(validator.errors) });
        return;
      }
      const response = await apiService({
        url: "https://ba35go67nk.execute-api.us-west-2.amazonaws.com/alpha/onboard-to-bourne/create-customer",
        body: JSON.stringify(payloadToSend),
        httpMethod: POST_METHOD_TYPE,
      });
      console.log("API response:", response.data);
      this.setState({ error: null });
    } catch (err) {
      console.error("Error calling API:", err);
      this.setState({ error: "API call failed" });
    }
  };

  render() {
    const { visible, onClose } = this.props;
    const { rawPayload, error } = this.state;

    return (
      <KatModal visible={visible} onClose={onClose} title="Enter Customer Configuration Payload">
        <KatLabel>Raw JSON Payload:</KatLabel>

        {/* ✅ Preserve Cursor Position in Editable Div & Support Undo/Redo */}
        <div
          ref={this.payloadDivRef}
          contentEditable={true}
          onInput={this.handleRawPayloadChange}
          style={{
            width: "100%",
            minHeight: "500px",
            height: "600px",
            padding: "10px",
            backgroundColor: "#f5f5f5",
            border: "1px solid #ccc",
            borderRadius: "5px",
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            overflowY: "auto",
            outline: "none",
          }}
          suppressContentEditableWarning={true}
        >
          {rawPayload}
        </div>

        <br />
        {error && <p style={{ color: "red" }}>{error}</p>}
        <br />

        <div style={{ marginTop: "20px" }}>
          <KatButton onClick={this.handleSubmit}>Submit Payload</KatButton>
        </div>
      </KatModal>
    );
  }
}

export default PayloadEditorModalCustomer;

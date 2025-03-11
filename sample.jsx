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

/** Set a deeply nested value given a dot-delimited path */
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

/** Recursively render form fields from a JSON object */
function DynamicForm({ data, onChange, path = "" }) {
  if (Array.isArray(data)) {
    return (
      <div style={{ marginLeft: "20px" }}>
        {data.map((item, index) => (
          <div key={index} style={{ marginBottom: "5px" }}>
            <label>{index}:</label>
            <DynamicForm data={item} onChange={onChange} path={path ? `${path}.${index}` : `${index}`} />
          </div>
        ))}
      </div>
    );
  } else if (typeof data === "object" && data !== null) {
    return (
      <div style={{ marginLeft: "20px", borderLeft: "1px solid #ccc", paddingLeft: "10px" }}>
        {Object.entries(data).map(([key, value]) => {
          const newPath = path ? `${path}.${key}` : key;
          return (
            <div key={key} style={{ marginBottom: "5px" }}>
              <label>{key}:</label>
              <DynamicForm data={value} onChange={onChange} path={newPath} />
            </div>
          );
        })}
      </div>
    );
  } else {
    return (
      <KatInput
        id={path}
        style={{ marginLeft: "10px" }}
        type={typeof data === "number" ? "number" : "text"}
        value={data || ""}
        onChange={(e) => onChange(path, e.target.value)}
      />
    );
  }
}

class PayloadEditorModalCustomer extends Component {
  constructor(props) {
    super(props);
    const initialRaw = JSON.stringify(createCustomerPayload, null, 2);
    this.state = {
      formPayload: createCustomerPayload,
      rawPayload: initialRaw,
      error: null,
      history: [initialRaw], // undo/redo history
      historyIndex: 0,
    };
    this.payloadDivRef = React.createRef();
  }

  // Get the current cursor position from the selection
  getCursorPosition = () => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    return { startOffset: range.startOffset, endOffset: range.endOffset };
  };

  // Set the cursor back to the saved position
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

  // Update state when the contentEditable div changes.
  handleRawPayloadChange = () => {
    const cursorPosition = this.getCursorPosition();
    const content = this.payloadDivRef.current.innerText;

    // Update history for undo/redo
    this.setState((prevState) => {
      const newHistory = prevState.history.slice(0, prevState.historyIndex + 1);
      newHistory.push(content);
      return {
        rawPayload: content,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    }, () => {
      this.setCursorPosition(cursorPosition);
    });

    try {
      const parsed = JSON.parse(content);
      this.setState({ formPayload: parsed, error: null });
    } catch {
      this.setState({ error: "Invalid JSON" });
    }
  };

  // Handle undo/redo using keyboard events.
  handleUndoRedo = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "z") {
      event.preventDefault();
      this.setState((prevState) => {
        let newIndex = prevState.historyIndex;
        if (!event.shiftKey && prevState.historyIndex > 0) {
          // Undo
          newIndex--;
        } else if (event.shiftKey && prevState.historyIndex < prevState.history.length - 1) {
          // Redo
          newIndex++;
        }
        return {
          rawPayload: prevState.history[newIndex],
          historyIndex: newIndex,
          formPayload: JSON.parse(prevState.history[newIndex]),
        };
      }, () => {
        if (this.payloadDivRef.current) {
          this.payloadDivRef.current.innerText = this.state.rawPayload;
        }
      });
    }
  };

  componentDidMount() {
    document.addEventListener("keydown", this.handleUndoRedo);
  }

  componentWillUnmount() {
    document.removeEventListener("keydown", this.handleUndoRedo);
  }

  // When dynamic form fields are updated
  handleDynamicChange = (path, value) => {
    const updatedPayload = JSON.parse(JSON.stringify(this.state.formPayload));
    setDeepValue(updatedPayload, path, value);
    const updatedRaw = JSON.stringify(updatedPayload, null, 2);
    this.setState({
      formPayload: updatedPayload,
      rawPayload: updatedRaw,
      error: null,
    }, () => {
      // Sync the contentEditable div if needed.
      if (this.payloadDivRef.current) {
        this.payloadDivRef.current.innerText = updatedRaw;
      }
    });
  };

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
    const { formPayload, rawPayload, error } = this.state;

    return (
      <KatModal visible={visible} onClose={onClose} title="Enter Customer Configuration Payload">
        <KatLabel>Raw JSON Payload:</KatLabel>

        {/* Editable div for raw JSON with cursor preservation */}
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

        {error && <p style={{ color: "red" }}>{error}</p>}

        <h4>Form Fields (Generated from JSON)</h4>
        <DynamicForm data={formPayload} onChange={this.handleDynamicChange} />

        <div style={{ marginTop: "20px" }}>
          <KatButton onClick={this.handleSubmit}>Submit Payload</KatButton>
        </div>
      </KatModal>
    );
  }
}

export default PayloadEditorModalCustomer;

// ScatterplotGeneLayer: Scatterplot with GPU gene visibility mask (1D texture LUT)
// - Adds per-instance geneId attribute (binary path)
// - Multiplies fragment alpha by visibility[geneId] sampled from a 1D texture

const {ScatterplotLayer} = deck;

export class ScatterplotGeneLayer extends ScatterplotLayer {
  initializeState() {
    super.initializeState();
    const attributeManager = this.getAttributeManager();
    // Allow binary attribute injection via data.attributes.instanceGeneId
    attributeManager.add({
      instanceGeneId: {
        size: 1,
        accessor: 'getGeneId',
        shaderAttributes: {
          instanceGeneId: {divisor: 1}
        }
      }
    });
    const gl = this.context.gl;
    // Create a default 1x1 mask (all visible) so first draw is valid
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const one = new Uint8Array([255]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, one);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.state.maskTex = tex;
    this.state.maskWidth = 1;
  }

  getShaders() {
    const shaders = super.getShaders();
    // Inject attribute, varying, and sampler
    const inject = {
      'vs:#decl': 'attribute float instanceGeneId; varying float vGeneId;',
      'vs:#main-end': 'vGeneId = instanceGeneId;',
      'fs:#decl': 'uniform sampler2D uMaskTex; uniform float uMaskWidth; varying float vGeneId;',
      'fs:DECKGL_FILTER_COLOR': `
        float idx = clamp((vGeneId + 0.5) / max(uMaskWidth, 1.0), 0.0, 1.0);
        float vis = texture2D(uMaskTex, vec2(idx, 0.5)).r;
        color.a *= vis;
      `
    };
    return {...shaders, inject};
  }

  updateState({props, oldProps}) {
    super.updateState({props, oldProps});
    // Update or create mask texture when geneMask changes (Uint8Array of length width)
    if (props.geneMask !== oldProps.geneMask) {
      this._updateMaskTexture(props.geneMask);
    }
  }

  _updateMaskTexture(maskArray) {
    const gl = this.context.gl;
    // Delete old
    if (this.state.maskTex) {
      gl.deleteTexture(this.state.maskTex);
      this.state.maskTex = null;
    }
    if (!maskArray || !maskArray.length) {
      // Keep existing texture (default 1x1 visible) and width
      return;
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    // Build RGBA texture of size (width x 1), store mask in R channel
    // For WebGL1, use LUMINANCE or ALPHA. Use LUMINANCE for compatibility
    try {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.LUMINANCE,
        maskArray.length,
        1,
        0,
        gl.LUMINANCE,
        gl.UNSIGNED_BYTE,
        new Uint8Array(maskArray)
      );
    } catch (e) {
      // Fallback to RGBA packing (should not be necessary)
      const width = maskArray.length;
      const rgba = new Uint8Array(width * 4);
      for (let i = 0; i < width; i++) {
        const v = maskArray[i];
        rgba[4 * i + 0] = v; rgba[4 * i + 1] = v; rgba[4 * i + 2] = v; rgba[4 * i + 3] = 255;
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.state.maskTex = tex;
    this.state.maskWidth = maskArray.length;
  }

  draw({uniforms}) {
    const gl = this.context.gl;
    // Always bind a mask texture (default created in initializeState)
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.state.maskTex);
    super.draw({
      uniforms: {
        ...uniforms,
        uMaskTex: 1, // sampler unit
        uMaskWidth: this.state.maskWidth
      }
    });
  }

  finalizeState() {
    const gl = this.context.gl;
    if (this.state.maskTex) {
      gl.deleteTexture(this.state.maskTex);
      this.state.maskTex = null;
    }
    super.finalizeState();
  }
}

export default ScatterplotGeneLayer;

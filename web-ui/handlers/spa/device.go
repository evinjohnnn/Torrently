package spa

import (
	"github.com/webtor-io/web-ui/handlers/device"
	"github.com/webtor-io/web-ui/services/web"
)

func init() { page("device/get", (*config).device) }

// Device is the human half of the device code flow ("device/get").
type Device struct {
	State      string `json:"state"` // input | confirm | invalid | done
	Code       string `json:"code,omitempty"`
	DeviceName string `json:"deviceName,omitempty"`
}

func (cfg *config) device(ctx *web.Context) (any, error) {
	d, ok := ctx.Data.(*device.Data)
	if !ok || d == nil {
		return nil, errNoData
	}
	return &Device{State: d.State, Code: d.Code, DeviceName: d.DeviceName}, nil
}
